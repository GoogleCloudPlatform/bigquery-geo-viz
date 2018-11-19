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

import {Component, ElementRef, Renderer2, ViewChild, ChangeDetectorRef, NgZone, ViewContainerRef, OnInit, OnDestroy} from '@angular/core';
import {FormBuilder, FormGroup, FormControl, FormArray, Validators} from '@angular/forms';
import {MatPaginator, MatTableDataSource, MatSnackBar} from '@angular/material';
import {CdkStepperModule, StepperSelectionEvent} from '@angular/cdk/stepper';
import {Subject} from 'rxjs/Subject';
import {Subscription} from 'rxjs/Subscription';
import 'rxjs/add/operator/debounceTime';
import 'rxjs/add/operator/map';

import {StyleProp, StyleProps, StyleFunctions, StyleRule} from './services/styles.service';
import {BigQueryService, ColumnStat, Project} from './services/bigquery.service';
import {
  Step,
  SAMPLE_PROJECT_ID,
  SAMPLE_QUERY,
  SAMPLE_FILL_COLOR,
  SAMPLE_FILL_OPACITY,
  MAX_RESULTS,
  MAX_RESULTS_PREVIEW,
  TIMEOUT_MS,
  SAMPLE_CIRCLE_RADIUS
} from './app.constants';

const DEBOUNCE_MS = 1000;

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  readonly title = 'BigQuery Geo Viz';
  constructor(public viewContainerRef: ViewContainerRef) {}
}
