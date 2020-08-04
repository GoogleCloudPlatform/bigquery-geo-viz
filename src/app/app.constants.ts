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
    STYLE: 2,
    SHARE: 3
};

// Maximum number of results to be returned by BigQuery API.
export const MAX_RESULTS = 5000000;

// Maximum number of results to be shown in the HTML preview table.
export const MAX_RESULTS_PREVIEW = 10;

// How long to wait for the query to complete, in milliseconds, before the request times out and returns.
export const TIMEOUT_MS = 120000;

// Used to write the sharing data and maintain backward compatibility.
export const SHARING_VERSION = 'v1';

export const SAMPLE_PROJECT_ID = '';
export const SAMPLE_QUERY = `SELECT
  ST_GeogPoint(longitude, latitude)  AS WKT,
  status,
  health,
  spc_common,
  user_type,
  problems,
  tree_dbh
FROM \`bigquery-public-data.new_york_trees.tree_census_2015\`
WHERE status = 'Alive'
LIMIT 50000;`;

// Each page is 10MB. This means the total data will be 250MB at most..
export const MAX_PAGES = 25;

export const SAMPLE_FILL_OPACITY = {isComputed: false, value: 0.8};
export const SAMPLE_FILL_COLOR = {
  isComputed: true,
  property: 'health',
  function: 'categorical',
  domain: ['Poor', 'Fair', 'Good'],
  range: ['#F44336', '#FFC107', '#4CAF50']
};
export const SAMPLE_CIRCLE_RADIUS = {
  isComputed: true,
  property: 'tree_dbh',
  function: 'linear',
  domain: [0, 500],
  range: [10, 50]
};

export const PALETTES = Object.keys(colorbrewer).map((key) => colorbrewer[key]);
