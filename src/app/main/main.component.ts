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

import { AfterViewInit, Component, ChangeDetectorRef, NgZone, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormBuilder, FormGroup, FormControl, FormArray, Validators } from '@angular/forms';
import { MatTableDataSource, MatSnackBar } from '@angular/material';
import { StepperSelectionEvent } from '@angular/cdk/stepper';
import { Subject } from 'rxjs/Subject';
import { Subscription } from 'rxjs/Subscription';
import 'rxjs/add/operator/debounceTime';
import 'rxjs/add/operator/map';

import { StyleProps, StyleRule } from '../services/styles.service';
import {
    BigQueryService,
    ColumnStat,
    Project,
    BigQueryDryRunResponse
} from '../services/bigquery.service';
import {
  Step,
  SAMPLE_QUERY,
  SAMPLE_FILL_COLOR,
  SAMPLE_FILL_OPACITY,
  MAX_RESULTS_PREVIEW,
  SAMPLE_CIRCLE_RADIUS
} from '../app.constants';

const DEBOUNCE_MS = 1000;

@Component({
  selector: 'app-main',
  templateUrl: './main.component.html',
  styleUrls: ['./main.component.css']
})
export class MainComponent implements OnInit, OnDestroy, AfterViewInit  {
  readonly title = 'BigQuery Geo Viz';
  readonly StyleProps = StyleProps;

  // GCP session data
  readonly dataService = new BigQueryService();
  isSignedIn: boolean;
  user: Object;
  matchingProjects: Array<Project> = [];

  // Form groups
  dataFormGroup: FormGroup;
  schemaFormGroup: FormGroup;
  stylesFormGroup: FormGroup;

  // BigQuery response data
  columns: Array<Object>;
  columnNames: Array<string>;
  project: String = '';
  dataset: String = '';
  table: String = '';
  bytesProcessed: Number = 0;
  lintMessage: String = '';
  pending = false;
  rows: Array<Object>;
  data: MatTableDataSource<Object>;
  stats: Map<String, ColumnStat> = new Map();

  // UI state
  stepIndex: Number = 0;

  // Current style rules
  styles: Array<StyleRule> = [];

  // CodeMirror configuration
  readonly cmConfig = {
    indentWithTabs: true,
    smartIndent: true,
    lineNumbers: true,
    lineWrapping: true
  };
  readonly cmDebouncer: Subject<string> = new Subject();
  cmDebouncerSub: Subscription;

  constructor(
    private _formBuilder: FormBuilder,
    private _snackbar: MatSnackBar,
    private _changeDetectorRef: ChangeDetectorRef,
    private _route: ActivatedRoute,
    private _ngZone: NgZone) {

    // Debounce CodeMirror change events to avoid running extra dry runs.
    this.cmDebouncerSub = this.cmDebouncer
      .debounceTime(DEBOUNCE_MS)
      .subscribe((value: string) => { this._dryRun(); });

    // Set up BigQuery service.
    this.dataService.onSigninChange(() => this.onSigninChange());
    this.dataService.init()
      .catch((e) => this.showMessage(parseErrorMessage(e)));
  }

  ngOnInit() {
    this.columns = [];
    this.columnNames = [];
    this.rows = [];

    this.project = this._route.snapshot.paramMap.get("project")
    this.dataset = this._route.snapshot.paramMap.get("dataset")
    this.table = this._route.snapshot.paramMap.get("table")

    // Data form group
    this.dataFormGroup = this._formBuilder.group({
      projectID: [this.project, Validators.required],
      sql: ['', Validators.required],
      location: [''],
    });
    this.dataFormGroup.controls.projectID.valueChanges.debounceTime(200).subscribe(() => {
      this.dataService.getProjects()
        .then((projects) => {
          this.matchingProjects = projects.filter((project) => {
            return project['id'].indexOf(this.dataFormGroup.controls.projectID.value) >= 0;
          });
        });
    });

    // Schema form group
    this.schemaFormGroup = this._formBuilder.group({ geoColumn: [''] });

    // Style rules form group
    const stylesGroupMap = {};
    StyleProps.forEach((prop) => stylesGroupMap[prop.name] = this.createStyleFormGroup());
    this.stylesFormGroup = this._formBuilder.group(stylesGroupMap);
    this.stylesFormGroup.valueChanges.debounceTime(500).subscribe(() => this.updateStyles());

    // Initialize default styles.
    this.updateStyles();
  }

  ngAfterViewInit() {
    setTimeout( () => {
        this.dataFormGroup.patchValue({ sql: "SELECT * FROM `" + this.project + "." + this.dataset + "." + this.table + "`"});
    },0)
  }

  ngOnDestroy() {
    this.cmDebouncerSub.unsubscribe();
  }

  signin() {
    this.dataService.signin();
  }

  signout() {
    this.dataService.signout();
  }

  onSigninChange() {
    this._ngZone.run(() => {
      this.isSignedIn = this.dataService.isSignedIn;
      if (!this.dataService.isSignedIn) { return; }
      this.user = this.dataService.getUser();
      this.dataService.getProjects()
        .then((projects) => {
          this.matchingProjects = projects;
          this._changeDetectorRef.detectChanges();
        });
    });
  }

  onStepperChange(e: StepperSelectionEvent) {
    this.stepIndex = e.selectedIndex;
    this.updateStyles();

    gtag('event', 'step', { event_label: `step ${this.stepIndex}` });
  }

  dryRun() {
    this.cmDebouncer.next();
  }

  _dryRun(): Promise<BigQueryDryRunResponse> {
    const { projectID, sql, location } = this.dataFormGroup.getRawValue();
    if (!projectID) return;
    const dryRun = this.dataService.prequery(projectID, sql, location)
      .then((response: BigQueryDryRunResponse) => {
        if (!response.ok) throw new Error('Query analysis failed.');
        const geoColumn = response.schema.fields.find((f) => f.type === 'GEOGRAPHY');
        if (response.statementType !== 'SELECT') {
          throw new Error('Expected a SELECT statement.');
        } else if (!geoColumn) {
          throw new Error('Expected a geography column, but found none.');
        }
        this.lintMessage = '';
        this.bytesProcessed = response.totalBytesProcessed;
        return response;
      });
    dryRun.catch((e) => {
      this.bytesProcessed = -1;
      this.lintMessage = parseErrorMessage(e);
    });
    return dryRun;
  }

  query() {
    if (this.pending) { return; }
    this.pending = true;

    const { projectID, sql, location } = this.dataFormGroup.getRawValue();

    let geoColumns;

    this._dryRun()
      .then((dryRunResponse) => {
        geoColumns = dryRunResponse.schema.fields.filter((f) => f.type === 'GEOGRAPHY');
        const hasNonGeoColumns = geoColumns.length < dryRunResponse.schema.fields.length;
        const nonGeoClause = hasNonGeoColumns
          ? `* EXCEPT(${geoColumns.map((f) => `\`${f.name}\``).join(', ') }),`
          : '';
        // Wrap the user's SQL query, replacing geography columns with GeoJSON.
        const wrappedSQL = `SELECT
            ${nonGeoClause}
            ${ geoColumns.map((f) => `ST_AsGeoJson(\`${f.name}\`) as \`${f.name}\``).join(', ') }
          FROM (\n${sql.replace(/;\s*$/, '')}\n);`;
        return this.dataService.query(projectID, wrappedSQL, location);
      })
      .then(({ columns, columnNames, rows, stats }) => {
        this.columns = columns;
        this.columnNames = columnNames;
        this.rows = rows;
        this.stats = stats;
        this.data = new MatTableDataSource(rows.slice(0, MAX_RESULTS_PREVIEW));
        this.schemaFormGroup.patchValue({geoColumn: geoColumns[0].name});
      })
      .catch((e) => {
        const error = e && e.result && e.result.error || {};
        if (error.status === 'INVALID_ARGUMENT' && error.message.match(/^Unrecognized name: f\d+_/)) {
          this.showMessage(
            'Geography columns must provide a name. For example, "SELECT ST_GEOGPOINT(1,2)" could ' +
            'be changed to "SELECT ST_GEOGPOINT(1,2) geo".'
          );
        } else {
          this.showMessage(parseErrorMessage(e));
        }
      })
      .then(() => {
        this.pending = false;
        this._changeDetectorRef.detectChanges();
      });
  }

  updateStyles() {
    if (this.stylesFormGroup.invalid) { return; }
    this.styles = this.stylesFormGroup.getRawValue();
  }

  getRowWidth() {
    return (this.columns.length * 100) + 'px';
  }

  onFillPreset() {
    switch (this.stepIndex) {
      case Step.DATA:
        this.dataFormGroup.patchValue({ sql: SAMPLE_QUERY });
        break;
      case Step.SCHEMA:
        this.schemaFormGroup.patchValue({ geoColumn: 'WKT' });
        break;
      case Step.STYLE:
        this.setNumStops(<FormGroup>this.stylesFormGroup.controls.fillColor, SAMPLE_FILL_COLOR.domain.length);
        this.setNumStops(<FormGroup>this.stylesFormGroup.controls.circleRadius, SAMPLE_CIRCLE_RADIUS.domain.length);
        this.stylesFormGroup.controls.fillOpacity.patchValue(SAMPLE_FILL_OPACITY);
        this.stylesFormGroup.controls.fillColor.patchValue(SAMPLE_FILL_COLOR);
        this.stylesFormGroup.controls.circleRadius.patchValue(SAMPLE_CIRCLE_RADIUS);
        break;
      default:
        console.warn(`Unexpected step index, ${this.stepIndex}.`);
    }

    gtag('event', 'preset', { event_label: `step ${this.stepIndex}` });
  }

  setNumStops(group: FormGroup, numStops: number): void {
    const domain = <FormArray>group.controls.domain;
    const range = <FormArray>group.controls.range;
    while (domain.length !== numStops) {
      if (domain.length < numStops) {
        domain.push(new FormControl(''));
        range.push(new FormControl(''));
      }
      if (domain.length > numStops) {
        domain.removeAt(domain.length - 1);
        range.removeAt(range.length - 1);
      }
    }
  }

  createStyleFormGroup(): FormGroup {
    return this._formBuilder.group({
      isComputed: [false],
      value: [''],
      property: [''],
      function: [''],
      domain: this._formBuilder.array([[''], ['']]),
      range: this._formBuilder.array([[''], ['']])
    });
  }

  getPropStatus(propName: string): string {
    const rule = <StyleRule>this.stylesFormGroup.controls[propName].value;
    if (!rule.isComputed && rule.value) { return 'global'; }
    if (rule.isComputed && rule.function) { return 'computed'; }
    return 'none';
  }

  getPropStats(propName: string): ColumnStat {
    const group = <FormGroup>this.stylesFormGroup.controls[propName];
    const rawValue = group.value;
    if (!rawValue.property) { return null; }
    return this.stats.get(rawValue.property);
  }

  getPropFormGroup(propName: string): FormGroup {
    return <FormGroup>this.stylesFormGroup.controls[propName];
  }

  showMessage(message: string, duration: number = 5000) {
    console.warn(message);
    this._ngZone.run(() => {
      this._snackbar.open(message, undefined, { duration: duration });
    });
  }
}

function parseErrorMessage (e, defaultMessage = 'Something went wrong') {
  if (e.message) { return e.message; }
  if (e.result && e.result.error && e.result.error.message) {
    return e.result.error.message;
  }
  return defaultMessage;
}
