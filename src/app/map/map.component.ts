/**
 * Copyright 2018 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Component, ElementRef, Input, NgZone, ViewChild, AfterViewInit, IterableDiffers, IterableDiffer } from '@angular/core';
import { StylesService, StyleRule } from '../services/styles.service';
import { GeoJsonLayer } from '@deck.gl/layers';
import { GoogleMapsOverlay } from '@deck.gl/google-maps';
import bbox from '@turf/bbox';
import { GeoJSONService, GeoJSONFeature } from '../services/geojson.service';

const LAYER_ID = 'geojson-layer';

const INITIAL_VIEW_STATE = { latitude: 45, longitude: 0, zoom: 2, pitch: 0 };

const DEFAULT_BATCH_SIZE = 5;

@Component({
  selector: 'app-map',
  templateUrl: './map.component.html',
  styleUrls: ['./map.component.css']
})
export class MapComponent implements AfterViewInit {
  // DOM element for map.
  @ViewChild('mapEl') mapEl: ElementRef;

  // Maps API instance.
  map: google.maps.Map;

  // Info window for display over Maps API.
  infoWindow: google.maps.InfoWindow;

  // Basemap styles.
  pendingStyles: Promise<google.maps.MapTypeStyle[]>;

  // Styling service.
  readonly styler = new StylesService();

  private _rows: object[] = [];
  private _features: GeoJSONFeature[] = [];
  private _styles: StyleRule[] = [];
  private _geoColumn: string;
  private _activeGeometryTypes = new Set<string>();
  private _geoJSONLayer = new GeoJsonLayer();

  // Detects how many times we have received new values.      
  private _numChanges = 0;
  // Counts after how many changes we should update the map.
  private _batchSize = DEFAULT_BATCH_SIZE;

  private _deckLayer: GoogleMapsOverlay = null;
  private _iterableDiffer = null;
  
  // Index for viewing geojson data one-by-one, 0 indicates view all data.
  private _page: number = 0;

  @Input()
  set rows(rows: object[]) {
    this._rows = rows;
    this.resetBatching();
    this.updateFeatures();
    this.updateStyles();
  }

  @Input()
  set geoColumn(geoColumn: string) {
    this._geoColumn = geoColumn;
    this.updateFeatures();
    this.updateStyles();
  }

  @Input()
  set page(page: number) {
    this._page = page;
    this.updateStyles();
  }

  @Input()
  set styles(styles: StyleRule[]) {
    this._styles = styles;
    this.updateStyles();
  }

  constructor(private _ngZone: NgZone, iterableDiffers: IterableDiffers) {
    this._iterableDiffer = iterableDiffers.find([]).create(null);
    this.pendingStyles = fetch('assets/basemap.json', { credentials: 'include' })
      .then((response) => response.json());
  }

  ngDoCheck() {
    let changes = this._iterableDiffer.diff(this._rows);
    if (changes) {
      this._numChanges++;
      if (this._numChanges >= this._batchSize) {
        this.updateFeatures();
        this.updateStyles();
        this._numChanges = 0;
        // Increase the batch size incrementally to keep the overhead low.
        this._batchSize = this._batchSize * 1.5;
      }
    }
  }

  /**
     * Constructs a Maps API instance after DOM has initialized.
     */
  ngAfterViewInit() {
    Promise.all([pendingMap, this.pendingStyles])
      .then(([_, mapStyles]) => {
        // Initialize Maps API outside of the Angular zone. Maps API binds event listeners,
        // and we do NOT want Angular to trigger change detection on these events. Ensuring
        // that Maps API interaction doesn't trigger change detection improves performance.
        // See: https://blog.angularindepth.com/boosting-performance-of-angular-applications-with-manual-change-detection-42cb396110fb
        this._ngZone.runOutsideAngular(() => {
          this.map = new google.maps.Map(this.mapEl.nativeElement, {
            center: { lat: INITIAL_VIEW_STATE.latitude, lng: INITIAL_VIEW_STATE.longitude },
            zoom: INITIAL_VIEW_STATE.zoom,
            tilt: 0
          });
          this.map.setOptions({ styles: mapStyles });
          this.infoWindow = new google.maps.InfoWindow({ content: '' });
          this.map.data.addListener('click', (e) => {
            this.showInfoWindow(e.feature, e.latLng);
          });
          this._deckLayer = new GoogleMapsOverlay({ layers: [] });
          this._deckLayer.setMap(this.map);
          this.map.addListener('click', (e) => this._onClick(e));
        });
      });
    console.log("page init again for some reason")
  }

  _onClick(e: google.maps.MouseEvent) {
    // TODO(donmccurdy): Do we need a public API for determining when layer is ready?
    if (!this._deckLayer._deck.layerManager) return;

    const { x, y } = e['pixel'];
    const picked = this._deckLayer.pickObject({ x, y, radius: 4 });

    if (picked) {
      this.showInfoWindow(picked.object, e.latLng);
    }
  }

  private resetBatching() {
    this._numChanges = 0;
    this._batchSize = DEFAULT_BATCH_SIZE;
  }

  /**
   * Converts row objects into GeoJSON, then loads into Maps API.
   */
  updateFeatures() {
    if (!this.map) return;

    this._features = GeoJSONService.rowsToGeoJSON(this._rows, this._geoColumn);

    // Note which types of geometry are being shown.
    this._activeGeometryTypes.clear();
    this._features.forEach((feature) => {
      this._activeGeometryTypes.add(feature.geometry['type']);
    });

    // Fit viewport bounds to the data.
    const [minX, minY, maxX, maxY] = bbox({ type: 'FeatureCollection', features: this._features });
    const bounds = new google.maps.LatLngBounds(
      new google.maps.LatLng(minY, minX),
      new google.maps.LatLng(maxY, maxX)
    );
    if (!bounds.isEmpty()) { this.map.fitBounds(bounds); }
  }


  updatePage() {
    if (!this.map) return;
    // const data = this._page === -1 ? this._features : [this._features[this._page]];
    const layer = this._deckLayer.props.layers.find(l => l.id === LAYER_ID);
  }
  /**
   * Updates styles applied to all GeoJSON features.
   */
  updateStyles() {
    if (!this.map) return;
    this.styler.uncache();

    // Remove old features.
    this._deckLayer.setProps({ layers: [] });

    // Create GeoJSON layer.
    const colorRe = /(\d+), (\d+), (\d+)/;
    const layer = new GeoJsonLayer({
      id: LAYER_ID,
      data: this._page === 0 ? this._features : [this._features[this._page - 1]],
      pickable: true,
      autoHighlight: true,
      highlightColor: [219, 68, 55], // #DB4437
      stroked: this.hasStroke(),
      filled: true,
      extruded: false,
      elevationScale: 0,
      binary: true,
      lineWidthUnits: 'pixels',
      pointRadiusMinPixels: 1,
      getFillColor: (d) => {
        let color = this.getStyle(d, this._styles, 'fillColor');
        if (typeof color === 'string') color = color.match(colorRe).slice(1, 4).map(Number);
        const opacity = this.getStyle(d, this._styles, 'fillOpacity');
        return [...color, opacity * 256];
      },
      getLineColor: (d) => {
        let color = this.getStyle(d, this._styles, 'strokeColor');
        if (typeof color === 'string') color = color.match(colorRe).slice(1, 4).map(Number);
        const opacity = this.getStyle(d, this._styles, 'strokeOpacity');
        return [...color, opacity * 256];
      },
      getLineWidth: (d) => this.getStyle(d, this._styles, 'strokeWeight'),
      getRadius: (d) => this.getStyle(d, this._styles, 'circleRadius'),
    });

    this._deckLayer.setProps({ layers: [layer] });
  }

  /**
   * Return a given style for a given feature.
   * @param feature
   * @param style
   */
  getStyle(feature, styles: StyleRule[], styleName: string) {
    return this.styler.parseStyle(styleName, feature['properties'], styles[styleName]);
  }

  /**
   * Returns whether the style is currently enabled.
   * @param styles
   * @param styleName
   */
  hasStyle(styles: StyleRule[], styleName: string): boolean {
    const rule = styles[styleName];
    if (!rule) return false;
    if (!rule.isComputed) return !!rule.value || rule.value === '0';
    return rule.property && rule.function;
  }

  hasStroke() {
    return this._activeGeometryTypes.has('LineString')
      || this._activeGeometryTypes.has('MultiLineString')
      || this._activeGeometryTypes.has('Polygon')
      || this._activeGeometryTypes.has('MultiPolygon');
  }

  /**
   * Displays info window for selected feature.
   * @param feature
   * @param latLng
   */
  showInfoWindow(feature: GeoJSONFeature, latLng: google.maps.LatLng) {
    this.infoWindow.setContent(`<pre>${JSON.stringify(feature.properties, null, 2)}</pre>`);
    this.infoWindow.open(this.map);
    this.infoWindow.setPosition(latLng);
  }
}