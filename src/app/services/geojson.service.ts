import { Feature } from 'geojson';

export class GeoJSONService {

  /**
   * Converts rows to GeoJSON features.
   * @param rows
   * @param geoColumn
   */
  static rowsToGeoJSON(rows: object[], geoColumn: string): Feature[] {
    if (!rows || !geoColumn) { return []; }

    // Convert rows to GeoJSON features.
    const features = [];
    rows.forEach((row) => {
      if (!row[geoColumn]) { return; }
      try {
        const geometry = JSON.parse(row[geoColumn]);
        const feature = { type: 'Feature', geometry, properties: row };
        features.push(feature);
      } catch (e) {
        // Parsing can fail (e.g. invalid GeoJSON); just log the error.
        console.error(e);
      }
    });

    return features;
  }
}
