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

import { Component, ElementRef, Input, ViewChild, AfterViewInit } from '@angular/core';
import { StylesService, StyleRule } from '../services/styles.service';
import { Deck } from '@deck.gl/core';
import { GeoJsonLayer } from '@deck.gl/layers';
import bbox from '@turf/bbox';
import { GeoJSONService, GeoJSONFeature } from '../services/geojson.service';

const LAYER_ID = 'geojson-layer';

const TILE_SIZE = 256;

const INITIAL_VIEW_STATE = { latitude: 45, longitude: 0, zoom: 2, pitch: 0 };

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

  private _isMounted = false;
  private _canvasEl: HTMLCanvasElement = null;
  private _deckInstance: Deck = null;
  private _overlay: google.maps.OverlayView = null;
  private _hoveredFeature: GeoJSONFeature = null;

  @Input()
  set rows(rows: object[]) {
    this._rows = rows;
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
  set styles(styles: StyleRule[]) {
    this._styles = styles;
    this.updateStyles();
  }

  constructor () {
    this.pendingStyles = fetch('assets/basemap.json', {credentials: 'include'})
      .then((response) => response.json());
  }

  /**
   * Constructs a Maps API instance after DOM has initialized.
   */
  ngAfterViewInit() {
    Promise.all([ pendingMap, this.pendingStyles ])
      .then(([_, mapStyles]) => {
        this.map = new google.maps.Map(this.mapEl.nativeElement, {
          center: {lat: INITIAL_VIEW_STATE.latitude, lng: INITIAL_VIEW_STATE.longitude},
          zoom: INITIAL_VIEW_STATE.zoom
        });
        this.map.setOptions({styles: mapStyles});
        this.infoWindow = new google.maps.InfoWindow({content: ''});
        this.map.data.addListener('click', (e) => {
          this.showInfoWindow(e.feature, e.latLng);
        });
        this._overlay = new google.maps.OverlayView();
        this._overlay.draw = () => this._draw();
        this._overlay.setMap(this.map);
        this.map.addListener('click', (e) => this._onClick(e));
        this.map.addListener('mousemove', (e) => this._onMousemove(e));
      });

    // Create DeckGL instance.
    this._canvasEl = document.createElement('canvas');
    this._canvasEl.width = this.mapEl.nativeElement.clientWidth;
    this._canvasEl.height = this.mapEl.nativeElement.clientHeight;
    this._canvasEl.style.position = 'absolute'; // needed?
    this._deckInstance = new Deck({
      canvas: this._canvasEl,
      width: this._canvasEl.width,
      height: this._canvasEl.height,
      initialViewState: INITIAL_VIEW_STATE,
      // Google Maps Platform has no rotating capabilities, so we disable rotation here.
      controller: {
        scrollZoom: false,
        dragPan: false,
        dragRotate: false,
        doubleClickZoom: false,
        touchZoom: false,
        touchRotate: false,
        keyboard: false,
      },
      layers: []
    });

    window.addEventListener('resize', () => this._onResize());
  }

  _onResize() {
    const width = this.mapEl.nativeElement.clientWidth;
    const height = this.mapEl.nativeElement.clientHeight;
    this._canvasEl.width = width;
    this._canvasEl.height = height;

    if (this._deckInstance) {
      this._deckInstance.width = width;
      this._deckInstance.height = height;
    }
  }

  _onClick(e: google.maps.MouseEvent) {
    const { x, y } = e['pixel'];
    const picked = this._deckInstance.pickObject({ x, y, radius: 4 });

    if (picked) {
      this.showInfoWindow(picked.object, e.latLng);
    }
  }

  _onMousemove(e: google.maps.MouseEvent) {
    if (!this._deckInstance.layerManager) {
      return;
    }

    const { x, y } = e['pixel'];
    const picked = this._deckInstance.pickObject({ x, y, radius: 0 });

    if (picked && this._hoveredFeature !== picked.object) {
      this._hoveredFeature = picked.object;
      document.body.classList.add('cursor-pointer');
    } else if (!picked) {
      this._hoveredFeature = null;
      document.body.classList.remove('cursor-pointer');
    }
  }

  /**
   * Converts row objects into GeoJSON, then loads into Maps API.
   */
  updateFeatures() {
    this._features = GeoJSONService.rowsToGeoJSON(this._rows, this._geoColumn);

    // Fit viewport bounds to the data.
    const [minX, minY, maxX, maxY] = bbox({type: 'FeatureCollection', features: this._features});
    const bounds = new google.maps.LatLngBounds(
      new google.maps.LatLng(minY, minX),
      new google.maps.LatLng(maxY, maxX)
    );
    if (!bounds.isEmpty()) { this.map.fitBounds(bounds); }
  }

  /**
   * Updates styles applied to all GeoJSON features.
   */
  updateStyles() {
    if (!this.map) { return; }
    this.styler.uncache();

    // Remove old features.
    this._deckInstance.setProps({ layers: [] });

    // Create GeoJSON layer.
    const colorRe = /(\d+), (\d+), (\d+)/;
    const layer = new GeoJsonLayer({
      id: LAYER_ID,
      data: this._features,
      pickable: true,
      autoHighlight: true,
      highlightColor: [219, 68, 55], // #DB4437
      stroked: false,
      filled: true,
      extruded: true,
      pointRadiusScale: 5,
      lineWidthScale: 20,
      lineWidthMinPixels: 2,
      elevationScale: 0.01,
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
      getRadius: (d) => this.getStyle(d, this._styles, 'circleRadius'),
      getLineWidth: (d) => this.getStyle(d, this._styles, 'strokeWeight'),
    });

    this._deckInstance.setProps({ layers: [layer] });
  }

  /**
   * Return a given style for a given feature.
   * @param feature
   * @param style
   */
  getStyle (feature, styles: StyleRule[], styleName: string) {
    return this.styler.parseStyle(styleName, feature['properties'], styles[styleName]);
  }

  /**
   * Displays info window for selected feature.
   * @param feature
   * @param latLng
   */
  showInfoWindow (feature: GeoJSONFeature, latLng: google.maps.LatLng) {
    this.infoWindow.setContent(`<pre>${JSON.stringify(feature.properties, null, 2)}</pre>`);
    this.infoWindow.open(this.map);
    this.infoWindow.setPosition(latLng);
  }

  _draw () {
    // Methods like map.getCenter() and map.getZoom() return rounded values that
    // don't stay in sync during zoom and pan gestures, so compute center and
    // zoom from the overlay projection, instead.
    // Don't call overlay.getPanes() until map has initialized.
    if (!this._isMounted) {
      const overlayLayerEl = this._overlay.getPanes().overlayLayer;
      overlayLayerEl.appendChild(this._canvasEl);
      this._isMounted = true;
    }

    const { clientWidth, clientHeight } = this.mapEl.nativeElement;
    const projection = this._overlay.getProjection();

    // Fit canvas to current viewport.
    const bounds = this.map.getBounds();
    const nwContainerPx = new google.maps.Point(0, 0);
    const nw = projection.fromContainerPixelToLatLng(nwContainerPx);
    const nwDivPx = projection.fromLatLngToDivPixel(nw);
    this._canvasEl.style.top = nwDivPx.y + 'px';
    this._canvasEl.style.left = nwDivPx.x + 'px';

    // Compute fractional zoom.
    const zoom = Math.log2(projection.getWorldWidth() / TILE_SIZE) - 1;

    // Compute fractional center.
    const centerPx = new google.maps.Point(clientWidth / 2, clientHeight / 2);
    const centerContainer = projection.fromContainerPixelToLatLng(centerPx);
    const latitude = centerContainer.lat();
    const longitude = centerContainer.lng();

    const deck = this._deckInstance;
    deck.setProps({ viewState: { zoom, latitude, longitude } });
    if (deck.layerManager) {
      deck.animationLoop.redraw();
    }
  }
}

function truncateWKT(text: string): string {
  text = String(text);
  return text.length <= 100 ? text : text.substr(0, 100) + '…';
}
