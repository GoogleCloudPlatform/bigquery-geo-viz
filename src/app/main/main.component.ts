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

import { Component, ChangeDetectorRef, Inject, NgZone, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormBuilder, FormGroup, FormControl, FormArray, Validators } from '@angular/forms';
import { LOCAL_STORAGE, WebStorageService } from 'angular-webstorage-service';
import { MatTableDataSource, MatSnackBar } from '@angular/material';
import { StepperSelectionEvent } from '@angular/cdk/stepper';
import { Subject } from 'rxjs/Subject';
import { Subscription } from 'rxjs/Subscription';
import 'rxjs/add/operator/debounceTime';
import 'rxjs/add/operator/map';

import { StyleProps, StyleRule } from '../services/styles.service';
import {
    BigQueryService,
    BigQueryColumn,
    ColumnStat,
    Project,
    BigQueryDryRunResponse,
    BigQueryResponse
} from '../services/bigquery.service';

import { FirestoreService, ShareableData } from '../services/firestore.service'
import {
  Step,
  SAMPLE_QUERY,
  SAMPLE_FILL_COLOR,
  SAMPLE_FILL_OPACITY,
  MAX_RESULTS_PREVIEW,
  SAMPLE_CIRCLE_RADIUS,
  SHARING_VERSION,
  MAX_RESULTS
} from '../app.constants';

const DEBOUNCE_MS = 1000;
const USER_QUERY_START_MARKER = '--__USER__QUERY__START__';
const USER_QUERY_END_MARKER = '--__USER__QUERY__END__';

@Component({
  selector: 'app-main',
  templateUrl: './main.component.html',
  styleUrls: ['./main.component.css']
})

export class MainComponent implements OnInit, OnDestroy {
  readonly title = 'BigQuery Geo Viz';
  readonly StyleProps = StyleProps;
  readonly projectIdRegExp = new RegExp('^[a-z][a-z0-9\.:-]*$', 'i');
  readonly datasetIDRegExp = new RegExp('^[_a-z][a-z_0-9]*$', 'i');
  readonly tableIDRegExp = new RegExp('^[a-z][a-z_0-9]*$', 'i');
  readonly jobIdRegExp = new RegExp('[a-z0-9_-]*$', 'i');
  readonly localStorageKey = 'execution_local_storage_key';

  // GCP session data
  readonly dataService = new BigQueryService();
  readonly storageService = new FirestoreService();
  isSignedIn: boolean;
  user: Object;
  matchingProjects: Array<Project> = [];

  // Form groups
  dataFormGroup: FormGroup;
  schemaFormGroup: FormGroup;
  stylesFormGroup: FormGroup;
  sharingFormGroup: FormGroup;

  // BigQuery response data
  columns: Array<Object>;
  columnNames: Array<string>;
  geoColumnNames: Array<string>;
  projectId = '';
  dataset = '';
  table = '';
  jobId = '';
  location = '';
  bytesProcessed: number = 0;
  lintMessage = '';
  pending = false;
  rows: Array<Object>;
  totalRows: number = 0;
  maxRows: number = MAX_RESULTS;
  data: MatTableDataSource<Object>;
  stats: Map<String, ColumnStat> = new Map();
  sideNavOpened: boolean = true;
  // If a new query is run or the styling has changed, we need to generate a new sharing id.
  newSharingIdRequired = false;
  // Track if the stepper has actually changed.
  stepperChanged = false;
  sharingId = '';

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
    @Inject(LOCAL_STORAGE) private _storage: WebStorageService,
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
    this.geoColumnNames = [];
    this.rows = [];

    // Read parameters from URL
    this.projectId = this._route.snapshot.paramMap.get("project");
    this.dataset = this._route.snapshot.paramMap.get("dataset");
    this.table = this._route.snapshot.paramMap.get("table");
    this.jobId = this._route.snapshot.paramMap.get("job");
    this.location = this._route.snapshot.paramMap.get("location") || ''; // Empty string for 'Auto Select'
    this.sharingId = this._route.snapshot.queryParams["shareid"];

    // Data form group
    this.dataFormGroup = this._formBuilder.group({
      projectId: ['', Validators.required],
      sql: ['', Validators.required],
      location: [''],
    });
    this.dataFormGroup.controls.projectId.valueChanges.debounceTime(200).subscribe(() => {
      this.dataService.getProjects()
        .then((projects) => {
          this.matchingProjects = projects.filter((project) => {
            return project['id'].indexOf(this.dataFormGroup.controls.projectId.value) >= 0;
          });
        });
    });

    // Schema form group
    this.schemaFormGroup = this._formBuilder.group({ geoColumn: [''] });

    // Style rules form group
    const stylesGroupMap = {};
    StyleProps.forEach((prop) => stylesGroupMap[prop.name] = this.createStyleFormGroup());
    this.stylesFormGroup = this._formBuilder.group(stylesGroupMap);
    
    // Sharing form group
    this.sharingFormGroup = this._formBuilder.group({
      sharingUrl : '',
    });

    // Initialize default styles.
    this.updateStyles();
  }

  saveDataToSharedStorage() {
    const dataValues = this.dataFormGroup.getRawValue(); 
    const styleValues = this.styles;
    var shareableData = {
      sharingVersion: SHARING_VERSION,
      projectId : dataValues.projectId,
      jobId : this.jobId,
      location: dataValues.location,
      styles: styleValues
    };
    return this.storageService.storeShareableData(shareableData).then((written_doc_id) => {
      this.sharingId = written_doc_id;
    })
  }

  restoreDataFromSharedStorage(docId : string) : Promise<ShareableData>{
    return this.storageService.getSharedData(this.sharingId);
  }

  saveDataToLocalStorage(projectId : string, sql : string, location : string) {
    this._storage.set(this.localStorageKey, {projectId: projectId, sql: sql, location: location});
  }

  loadDataFromLocalStorage() : {projectId : string, sql : string, location : string} {
    return this._storage.get(this.localStorageKey);
  }

  clearDataFromLocalStorage() {
    this._storage.remove(this.localStorageKey);
  }

  resetUIOnSingout() {
    this.clearDataFromLocalStorage();
    this.dataFormGroup.reset();
    this.lintMessage = '';
  }

  ngOnDestroy() {
    this.cmDebouncerSub.unsubscribe();
  }

  signin() {
    this.clearDataFromLocalStorage();
    this.dataService.signin();
  }

  signout() {
    this.resetUIOnSingout();
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

      if (this._hasJobParams() && this._jobParamsValid()) {
        this.dataFormGroup.patchValue({
          sql: '/* Loading sql query from job... */',
          projectId: this.projectId,
          location: this.location
        });
        this.dataService.getQueryFromJob(this.jobId, this.location, this.projectId).then((queryText) => {
          this.dataFormGroup.patchValue({
            sql: queryText.sql,
          });
        });
      } else if (this._hasTableParams() && this._tableParamsValid()) {
        this.dataFormGroup.patchValue({
          sql: `SELECT * FROM \`${this.projectId}.${this.dataset}.${this.table}\`;`,
          projectId: this.projectId,
        });
      } else if (this.sharingId) {
	this.restoreDataFromSharedStorage(this.sharingId).then((shareableValues) => {
	  if (shareableValues) {
	    if (shareableValues.sharingVersion != SHARING_VERSION) {
	      throw new Error('Sharing link is invalid.');
	    }
	    this.dataFormGroup.patchValue({
	      sql: '/* Loading sql query from job... */',
	      projectId: shareableValues.projectId,
	      location: shareableValues.location
	    });
	    this.dataService.getQueryFromJob(shareableValues.jobId, shareableValues.location, shareableValues.projectId).then((queryText) => {
	      this.dataFormGroup.patchValue({
		sql: this.convertToUserQuery(queryText.sql),
	      });
	    });
	    this.setNumStops(<FormGroup>this.stylesFormGroup.controls.fillColor, shareableValues.styles['fillColor'].domain.length);
	    this.setNumStops(<FormGroup>this.stylesFormGroup.controls.fillOpacity, shareableValues.styles['fillOpacity'].domain.length);
	    this.setNumStops(<FormGroup>this.stylesFormGroup.controls.strokeColor, shareableValues.styles['strokeColor'].domain.length);
	    this.setNumStops(<FormGroup>this.stylesFormGroup.controls.strokeOpacity, shareableValues.styles['strokeOpacity'].domain.length);
	    this.setNumStops(<FormGroup>this.stylesFormGroup.controls.strokeWeight, shareableValues.styles['strokeWeight'].domain.length);
	    this.setNumStops(<FormGroup>this.stylesFormGroup.controls.circleRadius, shareableValues.styles['circleRadius'].domain.length);
	    this.stylesFormGroup.patchValue(shareableValues.styles);
	    this.updateStyles();
	  }
	}).catch((e) => this.showMessage(parseErrorMessage(e)));
      } else {
	const localStorageValues = this.loadDataFromLocalStorage();
        if (localStorageValues) {
          this.dataFormGroup.patchValue({
            sql: localStorageValues.sql,
            projectId: localStorageValues.projectId,
            location: localStorageValues.location
          });
        }
      }
    });
  }

  generateSharingUrl() {
    if (this.stepIndex == Step.SHARE && this.stepperChanged && this.newSharingIdRequired) {
      this.sharingFormGroup.patchValue({
	sharingUrl: 'Generating URL...'
      });
      this.saveDataToSharedStorage().then(() => {
	this.sharingFormGroup.patchValue({
	  sharingUrl: window.location.origin + '?shareid='+ this.sharingId
	});
	this.newSharingIdRequired = false;
      }).catch((e) => this.showMessage(parseErrorMessage(e)));
    }
  }

  onStepperChange(e: StepperSelectionEvent) {
    this.stepIndex = e.selectedIndex;
    if (e.selectedIndex != e.previouslySelectedIndex) { 
      this.stepperChanged = true;
    } else {
      this.stepperChanged = false;
    }
    gtag('event', 'step', { event_label: `step ${this.stepIndex}` });
  }

  dryRun() {
    this.cmDebouncer.next();
  }

  _hasJobParams() : boolean {
    return !!(this.jobId && this.projectId);
  }

  _hasTableParams() : boolean {
    return !!(this.projectId && this.dataset && this.table);
  }

  _jobParamsValid(): boolean {
    return this.projectIdRegExp.test(this.projectId) &&
           this.jobIdRegExp.test(this.jobId);
  }
  _tableParamsValid(): boolean {
    return this.projectIdRegExp.test(this.projectId) &&
      this.datasetIDRegExp.test(this.dataset) &&
      this.tableIDRegExp.test(this.table);
  }

  _dryRun(): Promise<BigQueryDryRunResponse> {
    const { projectId, sql, location } = this.dataFormGroup.getRawValue();
    if (!projectId) return;
    const dryRun = this.dataService.prequery(projectId, sql, location)
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

  // 'count' is used to track the number of request. Each request is 10MB, so we are limiting the total to 250 MB.
  getResults(count: number, projectId: string, inputPageToken: string, location: string, jobId: string)  : Promise<BigQueryResponse> {
    if (!inputPageToken || count >= 25) {
      // Force an update feature here since everything is done.
      var localRows : Array<Object> = [];
      localRows.push(...this.rows);
      this.rows = localRows;
      return;
    }
    count = count + 1;
    return this.dataService.getResults(projectId, jobId, location, inputPageToken, this.columns, this.stats).then(({ rows, stats, pageToken }) => { 
      this.rows.push(...rows);                                                                                      
      this.stats = stats;
      this._changeDetectorRef.detectChanges();
      return this.getResults(count, projectId, pageToken, location, jobId);
    });
  }

  convertToUserQuery(geovizQuery : string) : string {
    if (!geovizQuery) return '';

    var lines = geovizQuery.split('\n');
    var userQueryStarted = false;
    var userQuery = '';
    lines.forEach((line) => {
      if (line.includes(USER_QUERY_START_MARKER)) {
	userQueryStarted = true;
      } else if (line.includes(USER_QUERY_END_MARKER)) {
	userQueryStarted = false;
      } else {
	if (userQueryStarted) {
	  userQuery += line + '\n';
	}
      }
    });

    return userQuery.trim();
  }

  convertToGeovizQuery(userQuery : string, geoColumns: BigQueryColumn[], numCols : number) :  string {
    const hasNonGeoColumns = geoColumns.length < numCols;
    const nonGeoClause = hasNonGeoColumns
      ? `* EXCEPT(${geoColumns.map((f) => `\`${f.name}\``).join(', ') }),`
      : '';
    return `SELECT
  ${nonGeoClause}
  ${ geoColumns.map((f) => `ST_AsGeoJson(\`${f.name}\`) as \`${f.name}\``).join(', ') }
FROM (
${USER_QUERY_START_MARKER}\n
${userQuery.replace(/;\s*$/, '')}\n
${USER_QUERY_END_MARKER}\n
);`;              
  }

  query() {
    if (this.pending) { return; }
    this.pending = true;

    // We will save the query information to local store to be restored next
    // time that the app is launched.
    const dataFormValues = this.dataFormGroup.getRawValue();
    this.projectId = dataFormValues.projectId;
    const sql = dataFormValues.sql;
    this.location = dataFormValues.location;
    this.saveDataToLocalStorage(this.projectId, sql, this.location);

    let geoColumns;

    this._dryRun()
      .then((dryRunResponse) => {
        geoColumns = dryRunResponse.schema.fields.filter((f) => f.type === 'GEOGRAPHY');
        // Wrap the user's SQL query, replacing geography columns with GeoJSON.
        const wrappedSQL = this.convertToGeovizQuery(sql, geoColumns, dryRunResponse.schema.fields.length); 
        return this.dataService.query(this.projectId, wrappedSQL, this.location);
      })
      .then(({ columns, columnNames, rows, stats, totalRows, pageToken, jobId }) => {
        this.columns = columns;
        this.columnNames = columnNames;
        this.geoColumnNames = geoColumns.map((f) => f.name)
	this.rows = rows;                                                                                      
        this.stats = stats;
        this.data = new MatTableDataSource(rows.slice(0, MAX_RESULTS_PREVIEW));
        this.schemaFormGroup.patchValue({geoColumn: geoColumns[0].name});
        this.totalRows = totalRows;
	this.jobId = jobId;
        return this.getResults(0, this.projectId, pageToken, this.location, jobId);
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
	this.newSharingIdRequired = true;
        this._changeDetectorRef.detectChanges();
      });

  }

  onApplyStylesClicked() {
    this.newSharingIdRequired = true;
    this.updateStyles();
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
