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
import { StyleProps, StylesService, StyleRule } from '../services/styles.service';
import * as parseWKT from 'wellknown';
import { Deck } from '@deck.gl/core';
import { GeoJsonLayer } from '@deck.gl/layers';
import bbox from '@turf/bbox';

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

  private _rows: object[];
  private _geoColumn: string;

  private _isMounted = false;
  private _canvasEl: HTMLCanvasElement = null;
  private _deckInstance: Deck = null;
  private _overlay: google.maps.OverlayView = null;

  @Input()
  set rows(rows: object[]) {
    this._rows = rows;
    this.updateGeoJSON();
  }

  @Input()
  set geoColumn(geoColumn: string) {
    this._geoColumn = geoColumn;
    this.updateGeoJSON();
  }

  @Input()
  set styles(styles: StyleRule[]) {
    this.updateStyles(styles);
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

  /**
   * Converts row objects into GeoJSON, then loads into Maps API.
   */
  updateGeoJSON() {
    if (!this._rows || !this._geoColumn) { return; }

    // Remove old features.
    this._deckInstance.setProps({ layers: [] });

    const features = [];

    // Add new features.
    this._rows.forEach((row) => {
      try {
        const geometry = parseWKT(row[this._geoColumn]);
        const feature = {type: 'Feature', geometry, properties: row};
        features.push(feature);
      } catch (e) {
        // Parsing can fail (e.g. invalid WKT); just log the error.
        console.error(e);
      }
    });

    // Create GeoJSON layer.
    const layer = new GeoJsonLayer({
      id: 'geojson-layer',
      data: features,
      pickable: true,
      stroked: false,
      filled: true,
      extruded: true,
      lineWidthScale: 20,
      lineWidthMinPixels: 2,
      getFillColor: [160, 160, 180, 200],
      getLineColor: (d) => [255, 0, 128],
      getRadius: 100,
      getLineWidth: 1,
    });

    this._deckInstance.setProps({layers: [layer]});


    // Fit viewport bounds to the data.
    const [minX, minY, maxX, maxY] = bbox({type: 'FeatureCollection', features});
    const bounds = new google.maps.LatLngBounds(
      new google.maps.LatLng(minY, minX),
      new google.maps.LatLng(maxY, maxX)
    );
    if (!bounds.isEmpty()) { this.map.fitBounds(bounds); }
  }

  /**
   * Updates styles applied to all GeoJSON features.
   */
  updateStyles(styles: StyleRule[]) {
    if (!this.map) { return; }
    this.styler.uncache();
    // TODO(donmccurdy): Update styles.

    // this.map.data.forEach((feature) => {
    //   const featureStyles = this.getStylesForFeature(feature, styles);
    //   if (this._geodesicFeatures.has(feature)) {
    //     const geodesicFeature = this._geodesicFeatures.get(feature);
    //     if (Array.isArray(geodesicFeature)) {
    //       geodesicFeature.forEach((f) => f.setOptions(featureStyles));
    //     } else {
    //       (<google.maps.Polyline> geodesicFeature).setOptions(featureStyles);
    //     }
    //   } else {
    //     this.map.data.overrideStyle(feature, featureStyles);
    //   }
    // });
  }

  /**
   * Returns applicable style rules for a given row.
   * @param row
   * @param styles
   */
  getStylesForFeature (feature: google.maps.Data.Feature, styles) {
    // Extract properties from feature instance.
    const properties = {};
    feature.forEachProperty((value, key) => {
      properties[key] = value;
    });

    // Parse styles.
    const featureStyles = {};
    StyleProps.forEach((style) => {
      featureStyles[style.name] = this.styler.parseStyle(style.name, properties, styles[style.name]);
    });

    // Maps API has no 'circleRadius' property, so create a scaled icon on the fly.
    const geometry = feature.getGeometry();
    const type = geometry && geometry.getType();
    if (type === 'Point' && featureStyles['circleRadius']) {
      featureStyles['icon'] = this.styler.getIcon(featureStyles['circleRadius'], featureStyles['fillColor'], featureStyles['fillOpacity']);
      delete featureStyles['circleRadius'];
    }
    return featureStyles;
  }

  /**
   * Displays info window for selected feature.
   * @param feature
   * @param latLng
   */
  showInfoWindow (feature: google.maps.Data.Feature, latLng: google.maps.LatLng) {
    const properties = {};
    feature.forEachProperty((value, key) => {
      properties[key] = key === this._geoColumn ? truncateWKT(value) : value;
    });
    this.infoWindow.setContent(`<pre>${JSON.stringify(properties, null, 2)}</pre>`);
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
      // TODO(donmccurdy): This should be wrapped up in a public `.redraw()` API.
      deck.animationLoop._setupFrame();
      deck.animationLoop._updateCallbackData();
      deck.animationLoop.onRender(deck.animationLoop.animationProps);
    }
  }
}

function recursiveExtendBounds(geometry: any, callback: Function, self) {
  if (geometry instanceof google.maps.LatLng) {
    callback.call(self, geometry);
  } else if (geometry instanceof google.maps.Data.Point) {
    callback.call(self, geometry.get());
  } else {
    geometry.getArray().forEach((g) => {
      recursiveExtendBounds(g, callback, self);
    });
  }
}

function truncateWKT(text: string): string {
  text = String(text);
  return text.length <= 100 ? text : text.substr(0, 100) + '…';
}
