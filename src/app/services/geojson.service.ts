import * as parseWKT from 'wellknown';

export interface GeoJSONFeature {
  geometry: {};
  properties: object;
}

export class GeoJSONService {
  /**
   * Converts rows to GeoJSON features, parsing WKT on the fly.
   * @param rows
   * @param geoColumn
   */
  static rowsToGeoJSON(rows: object[], geoColumn: string): GeoJSONFeature[] {
    if (!rows || !geoColumn) return [];

    // Convert rows to GeoJSON features.
    const features = [];
    rows.forEach((row) => {
      try {
        const geometry = parseWKT(row[geoColumn]);
        const feature = { type: 'Feature', geometry, properties: row };
        features.push(feature);
      } catch (e) {
        // Parsing can fail (e.g. invalid WKT); just log the error.
        console.error(e);
      }
    });

    return features;
  }
}