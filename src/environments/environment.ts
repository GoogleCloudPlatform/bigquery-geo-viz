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

export const environment = {
  production: false,
  authClientID: '419125973937-kl2cru5pu2vfugne7lr1hosgseh4lo1s.apps.googleusercontent.com',
  authScope: 'https://www.googleapis.com/auth/bigquery'
};

// Your web app's Firebase configuration
// TODO(hormati): Create a different config for testing.
export const firebaseConfig = {
  apiKey: "AIzaSyDS8k-x7L9vZ_mvvdyTzwQ1LNXsYLNnhOM",
  authDomain: "bigquerygeoviz.firebaseapp.com",
  databaseURL: "https://bigquerygeoviz.firebaseio.com",
  projectId: "bigquerygeoviz",
  storageBucket: "bigquerygeoviz.appspot.com",
  messagingSenderId: "419125973937",
  appId: "1:419125973937:web:eba1c63d64b58be3ec2390",
  measurementId: "G-FNH2K1BP5G"
};
