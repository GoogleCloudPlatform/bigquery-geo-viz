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

import * as colorbrewer from 'colorbrewer';

export const Step = {
    DATA: 0,
    SCHEMA: 1,
    STYLE: 2
};

export const SAMPLE_PROJECT_ID = 'google.com:bqmapper';
export const SAMPLE_QUERY = `SELECT
  ST_GeogPoint(longitude, latitude)  AS WKT,
  capacity,
  num_bikes_available,
  num_bikes_disabled,
  num_docks_available
FROM
  \`bigquery-public-data.new_york.citibike_stations\`
  where capacity > 0
LIMIT
  1000;`;

export const SAMPLE_FILL_OPACITY = {isComputed: false, value: 0.8};
export const SAMPLE_FILL_COLOR = {
  isComputed: true,
  property: 'num_bikes_disabled',
  function: 'interval',
  domain: [1, 100],
  range: ['#4285f4', '#9c27b0']
};
export const SAMPLE_CIRCLE_RADIUS = {
  isComputed: true,
  property: 'num_bikes_available',
  function: 'linear',
  domain: [0, 60],
  range: [2, 24]
};

// Maximum number of results to be returned by BigQuery API.
export const MAX_RESULTS = 2000;

// Maximum number of results to be shown in the HTML preview table.
export const MAX_RESULTS_PREVIEW = 10;

// How long to wait for the query to complete, in milliseconds, before the request times out and returns.
export const TIMEOUT_MS = 120000;

export const PALETTES = Object.keys(colorbrewer).map((key) => colorbrewer[key]);
