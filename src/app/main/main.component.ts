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

import {Component, ChangeDetectorRef, Inject, NgZone, OnInit, OnDestroy, AfterViewInit} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {FormBuilder, FormGroup, FormControl, FormArray, Validators} from '@angular/forms';
import {MatTableDataSource} from '@angular/material/table';
import {MatSnackBar} from '@angular/material/snack-bar';
import {StepperSelectionEvent} from '@angular/cdk/stepper';

import {LOCAL_STORAGE, StorageService} from 'ngx-webstorage-service';

import * as CryptoJS from 'crypto-js';

import {Subject, Subscription} from 'rxjs';
import {debounceTime} from 'rxjs/operators';

import {AnalyticsService} from '../services/analytics.service';
import {StyleProps, StyleRule} from '../services/styles.service';
import {
  BigQueryService,
  BigQueryColumn,
  ColumnStat,
  Project,
  BigQueryDryRunResponse,
  BigQueryResponse
} from '../services/bigquery.service';
import {FirestoreService, ShareableData} from '../services/firestore.service';
import {
  Step,
  SAMPLE_QUERY,
  SAMPLE_FILL_COLOR,
  SAMPLE_FILL_OPACITY,
  MAX_RESULTS_PREVIEW,
  SAMPLE_CIRCLE_RADIUS,
  SHARING_VERSION,
  MAX_RESULTS,
  MAX_PAGES
} from '../app.constants';

const DEBOUNCE_MS = 1000;
const USER_QUERY_START_MARKER = '--__USER__QUERY__START__';
const USER_QUERY_END_MARKER = '--__USER__QUERY__END__';

@Component({
  selector: 'app-main',
  templateUrl: './main.component.html',
  styleUrls: ['./main.component.css']
})

export class MainComponent implements OnInit, OnDestroy, AfterViewInit {
  readonly title = 'BigQuery Geo Viz';
  readonly StyleProps = StyleProps;
  readonly projectIDRegExp = new RegExp('^[a-z][a-z0-9\.:-]*$', 'i');
  readonly datasetIDRegExp = new RegExp('^[_a-z][a-z_0-9]*$', 'i');
  readonly tableIDRegExp = new RegExp('^[a-z][a-z_0-9]*$', 'i');
  readonly jobIDRegExp = new RegExp('[a-z0-9_-]*$', 'i');
  readonly localStorageKey = 'execution_local_storage_key';

  // GCP session data
  readonly dataService = new BigQueryService();
  readonly storageService = new FirestoreService();

  private readonly analyticsService = new AnalyticsService();

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
  projectID = '';
  dataset = '';
  table = '';
  jobID = '';
  location = '';
  // This contains the query that ran in the job.
  jobWrappedSql = '';
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
  sharingDataChanged = false;
  // Track if the stepper has actually changed.
  stepperChanged = false;
  sharingId = '';  // This is the input sharing Id from the url
  generatedSharingId = ''; // This is the sharing id generated for the current settings.
  sharingIdGenerationPending = false;

  // UI state
  stepIndex: Number = 0;

  // Current style rules
  styles: Array<StyleRule> = [];

  readonly cmDebouncer: Subject<string> = new Subject();
  cmDebouncerSub: Subscription;

  constructor(
    @Inject(LOCAL_STORAGE) private _storage: StorageService,
    private _formBuilder: FormBuilder,
    private _snackbar: MatSnackBar,
    private _changeDetectorRef: ChangeDetectorRef,
    private _route: ActivatedRoute,
    private _ngZone: NgZone) {

    // Debounce CodeMirror change events to avoid running extra dry runs.
    this.cmDebouncerSub = this.cmDebouncer
      .pipe(debounceTime(DEBOUNCE_MS))
      .subscribe((value: string) => {
        this._dryRun();
      });

    // Set up BigQuery service.
    this.dataService.onSigninChange(() => this.onSigninChange());
    this.dataService.init()
      .catch((e) => this.showMessage(parseErrorMessage(e)));
  }

  ngAfterViewInit(): void {
  }

  ngOnInit() {
    this.columns = [];
    this.columnNames = [];
    this.geoColumnNames = [];
    this.rows = [];

    // Read parameters from URL
    this.projectID = this._route.snapshot.paramMap.get('project');
    this.dataset = this._route.snapshot.paramMap.get('dataset');
    this.table = this._route.snapshot.paramMap.get('table');
    this.jobID = this._route.snapshot.paramMap.get('job');
    this.location = this._route.snapshot.paramMap.get('location') || ''; // Empty string for 'Auto Select'
    this.sharingId = this._route.snapshot.queryParams['shareid'];

    // Data form group
    this.dataFormGroup = this._formBuilder.group({
      projectID: ['', Validators.required],
      sql: ['', Validators.required],
      location: [''],
    });
    this.dataFormGroup.controls.projectID.valueChanges.pipe(debounceTime(200)).subscribe(() => {
      this.dataService.getProjects()
        .then((projects) => {
          this.matchingProjects = projects.filter((project) => {
            return project['id'].indexOf(this.dataFormGroup.controls.projectID.value) >= 0;
          });
        });
    });

    // Schema form group
    this.schemaFormGroup = this._formBuilder.group({geoColumn: ['']});

    // Style rules form group
    const stylesGroupMap = {};
    StyleProps.forEach((prop) => stylesGroupMap[prop.name] = this.createStyleFormGroup());
    this.stylesFormGroup = this._formBuilder.group(stylesGroupMap);

    // Sharing form group
    this.sharingFormGroup = this._formBuilder.group({
      sharingUrl: '',
    });

    // Initialize default styles.
    this.updateStyles();
  }

  saveDataToSharedStorage() {
    const dataValues = this.dataFormGroup.getRawValue();
    // Encrypt the style values using the sql string.
    const hashedStyleValues = CryptoJS.AES.encrypt(JSON.stringify(this.styles), this.jobWrappedSql + this.bytesProcessed);
    const shareableData = {
      sharingVersion: SHARING_VERSION,
      projectID: dataValues.projectID,
      jobID: this.jobID,
      location: dataValues.location,
      styles: hashedStyleValues.toString(),
      creationTimestampMs: Date.now()
    };

    return this.storageService.storeShareableData(shareableData).then((written_doc_id) => {
      this.generatedSharingId = written_doc_id;
    });
  }

  restoreDataFromSharedStorage(docId: string): Promise<ShareableData> {
    return this.storageService.getSharedData(this.sharingId);
  }

  saveDataToLocalStorage(projectID: string, sql: string, location: string) {
    this._storage.set(this.localStorageKey, {projectID: projectID, sql: sql, location: location});
  }

  loadDataFromLocalStorage(): { projectID: string, sql: string, location: string } {
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
      if (!this.dataService.isSignedIn) {
        return;
      }
      this.user = this.dataService.getUser();

      this.storageService.authorize(this.dataService.getCredential());
      this.dataService.getProjects()
        .then((projects) => {
          this.matchingProjects = projects;
          this._changeDetectorRef.detectChanges();
        });

      if (this._hasJobParams() && this._jobParamsValid()) {
        this.dataFormGroup.patchValue({
          sql: '/* Loading sql query from job... */',
          projectID: this.projectID,
          location: this.location
        });

        this.dataService.getQueryFromJob(this.jobID, this.location, this.projectID).then((queryText) => {
          this.dataFormGroup.patchValue({
            sql: queryText.sql,
          });
        });
      } else if (this._hasTableParams() && this._tableParamsValid()) {
        this.dataFormGroup.patchValue({
          sql: `SELECT *
                FROM \`${this.projectID}.${this.dataset}.${this.table}\`;`,
          projectID: this.projectID,
        });
      } else if (this.sharingId) {
        this.analyticsService.report('saved_state', 'load', 'from URL');
        this.restoreDataFromSharedStorage(this.sharingId).then((shareableValues) => {
          this.applyRetrievedSharingValues(shareableValues);
        }).catch((e) => this.showMessage(parseErrorMessage(e)));
      } else {
        const localStorageValues = this.loadDataFromLocalStorage();
        if (localStorageValues) {
          this.dataFormGroup.patchValue({
            sql: localStorageValues.sql,
            projectID: localStorageValues.projectID,
            location: localStorageValues.location
          });
        }
      }
    });
  }

  applyRetrievedSharingValues(shareableValues: ShareableData) {
    if (shareableValues) {
      if (shareableValues.sharingVersion != SHARING_VERSION) {
        throw new Error('Sharing link is invalid.');
      }
      this.dataFormGroup.patchValue({
        sql: '/* Loading sql query from job... */',
        projectID: shareableValues.projectID,
        location: shareableValues.location
      });
      this.dataService.getQueryFromJob(shareableValues.jobID, shareableValues.location, shareableValues.projectID).then((queryText) => {
        this.dataFormGroup.patchValue({
          sql: this.convertToUserQuery(queryText.sql),
        });
        const unencryptedStyles = JSON.parse(CryptoJS.enc.Utf8.stringify(CryptoJS.AES.decrypt(shareableValues.styles, queryText.sql + queryText.bytesProcessed)));
        this.setNumStops(<FormGroup>this.stylesFormGroup.controls.fillColor, unencryptedStyles['fillColor'].domain.length);
        this.setNumStops(<FormGroup>this.stylesFormGroup.controls.fillOpacity, unencryptedStyles['fillOpacity'].domain.length);
        this.setNumStops(<FormGroup>this.stylesFormGroup.controls.strokeColor, unencryptedStyles['strokeColor'].domain.length);
        this.setNumStops(<FormGroup>this.stylesFormGroup.controls.strokeOpacity, unencryptedStyles['strokeOpacity'].domain.length);
        this.setNumStops(<FormGroup>this.stylesFormGroup.controls.strokeWeight, unencryptedStyles['strokeWeight'].domain.length);
        this.setNumStops(<FormGroup>this.stylesFormGroup.controls.circleRadius, unencryptedStyles['circleRadius'].domain.length);
        this.stylesFormGroup.patchValue(unencryptedStyles);
        this.updateStyles();
        this.reportStyles();
      }).catch((e) => this.showMessage('Cannot retrieve styling options.'));
    }
  }

  clearGeneratedSharingUrl() {
    this.generatedSharingId = '';
    this.sharingDataChanged = true;
    this.sharingFormGroup.patchValue({
      sharingUrl: ''
    });
  }

  generateSharingUrl() {
    if (!this._hasJobParams()) {
      this.showMessage('Please first run a valid query before generating a sharing URL.');
      return;
    }
    if (this.stepIndex == Step.SHARE && this.stepperChanged && this.sharingDataChanged) {
      this.sharingDataChanged = false;
      this.sharingIdGenerationPending = true;

      this.saveDataToSharedStorage().then(() => {
        this.sharingFormGroup.patchValue({
          sharingUrl: window.location.origin + '?shareid=' + this.generatedSharingId
        });
      }).catch((e) => this.showMessage(parseErrorMessage(e)));
    }
    this.sharingIdGenerationPending = false;
    this.analyticsService.report('saved_state', 'share');
  }

  onStepperChange(e: StepperSelectionEvent) {
    this.stepIndex = e.selectedIndex;
    if (e.selectedIndex !== e.previouslySelectedIndex) {
      this.stepperChanged = true;
    } else {
      this.stepperChanged = false;
    }
    this.analyticsService.report('step', 'stepper', `step ${this.stepIndex}`);
  }

  dryRun() {
    this.cmDebouncer.next('next');
  }

  _hasJobParams(): boolean {
    return !!(this.jobID && this.projectID);
  }

  _hasTableParams(): boolean {
    return !!(this.projectID && this.dataset && this.table);
  }

  _jobParamsValid(): boolean {
    return this.projectIDRegExp.test(this.projectID) &&
      this.jobIDRegExp.test(this.jobID);
  }

  _tableParamsValid(): boolean {
    return this.projectIDRegExp.test(this.projectID) &&
      this.datasetIDRegExp.test(this.dataset) &&
      this.tableIDRegExp.test(this.table);
  }

  _dryRun(): Promise<BigQueryDryRunResponse> {
    const {projectID, sql, location} = this.dataFormGroup.getRawValue();
    if (!projectID) {
      return;
    }
    const dryRun = this.dataService.prequery(projectID, sql, location)
      .then((response: BigQueryDryRunResponse) => {
        if (!response.ok) {
          throw new Error('Query analysis failed.');
        }
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

  // 'count' is used to track the number of request. Each request is 10MB.
  getResults(count: number, projectID: string, inputPageToken: string, location: string, jobID: string): Promise<BigQueryResponse> {
    if (!inputPageToken || count >= MAX_PAGES) {
      // Force an update feature here since everything is done.
      this.rows = this.rows.slice(0);
      return;
    }
    count = count + 1;
    return this.dataService.getResults(projectID, jobID, location, inputPageToken, this.columns, this.stats).then(({
      rows,
      stats,
      pageToken
    }) => {
      this.rows.push(...rows);
      this.stats = stats;
      this._changeDetectorRef.detectChanges();
      return this.getResults(count, projectID, pageToken, location, jobID);
    });
  }

  convertToUserQuery(geovizQuery: string): string {
    if (!geovizQuery) {
      return '';
    }

    return geovizQuery.substring(
      geovizQuery.indexOf(USER_QUERY_START_MARKER) + USER_QUERY_START_MARKER.length,
      geovizQuery.indexOf(USER_QUERY_END_MARKER)
    ).trim() + '\n';
  }

  convertToGeovizQuery(userQuery: string, geoColumns: BigQueryColumn[], numCols: number): string {
    const hasNonGeoColumns = geoColumns.length < numCols;
    const nonGeoClause = hasNonGeoColumns
      ? `* EXCEPT(${geoColumns.map((f) => `\`${f.name}\``).join(', ')}),`
      : '';
    return `SELECT ${nonGeoClause}
                     ${geoColumns.map((f) => `ST_AsGeoJson(\`${f.name}\`) as \`${f.name}\``).join(', ')}
            FROM (
                   ${USER_QUERY_START_MARKER}
                   ${userQuery.replace(/;\s*$/, '')}
                   ${USER_QUERY_END_MARKER}
            );`;
  }

  query() {
    if (this.pending) {
      return;
    }
    this.pending = true;

    // We will save the query information to local store to be restored next
    // time that the app is launched.
    const dataFormValues = this.dataFormGroup.getRawValue();
    this.projectID = dataFormValues.projectID;
    const sql = dataFormValues.sql;
    this.location = dataFormValues.location;
    this.saveDataToLocalStorage(this.projectID, sql, this.location);

    // Clear the existing sharing URL.
    this.clearGeneratedSharingUrl();

    let geoColumns;

    this._dryRun()
      .then((dryRunResponse) => {
        geoColumns = dryRunResponse.schema.fields.filter((f) => f.type === 'GEOGRAPHY');

        // Wrap the user's SQL query, replacing geography columns with GeoJSON.
        this.jobWrappedSql = this.convertToGeovizQuery(sql, geoColumns, dryRunResponse.schema.fields.length);
        return this.dataService.query(this.projectID, this.jobWrappedSql, this.location);
      })
      .then(({columns, columnNames, rows, stats, totalRows, pageToken, jobID, totalBytesProcessed}) => {
        this.columns = columns;
        this.columnNames = columnNames;
        this.geoColumnNames = geoColumns.map((f) => f.name);
        this.rows = rows;
        this.stats = stats;
        this.data = new MatTableDataSource(rows.slice(0, MAX_RESULTS_PREVIEW));
        this.schemaFormGroup.patchValue({geoColumn: geoColumns[0].name});
        this.totalRows = totalRows;
        this.jobID = jobID;
        this.bytesProcessed = totalBytesProcessed;
        return this.analyticsService.reportBenchmark(
          'load_complete',
          'map',
          this.getResults(0, this.projectID, pageToken, this.location, jobID)
        );
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

  onApplyStylesClicked() {
    this.clearGeneratedSharingUrl();
    this.updateStyles();
    this.reportStyles();
  }

  updateStyles() {
    if (this.stylesFormGroup.invalid) {
      return;
    }
    this.styles = this.stylesFormGroup.getRawValue();
  }

  /**
   * Reports the currently selected styles to Analytics.
   * 
   * The key is the visualization property, e.g., `fillColor`, and the label is one of:
   *   - `global`,
   *   - `none`, or
   *   - for data-driven styles, the function used (`linear`, `interval` etc.).
   */
  private reportStyles() {
    for (const styleProperty of Object.keys(this.stylesFormGroup.getRawValue())) {
      const style = this.styles[styleProperty];
      if (style?.isComputed && style?.function) {
        this.analyticsService.report(`${styleProperty}`, 'visualize', style.function);
      } else if (!style?.isComputed && style?.value) {
        this.analyticsService.report(`${styleProperty}`, 'visualize', 'global');
      } else {
        this.analyticsService.report(`${styleProperty}`, 'visualize', 'none');
      }
    }
  }

  getRowWidth() {
    return (this.columns.length * 100) + 'px';
  }

  onFillPreset() {
    switch (this.stepIndex) {
      case Step.DATA:
        this.dataFormGroup.patchValue({sql: SAMPLE_QUERY});
        break;
      case Step.SCHEMA:
        this.schemaFormGroup.patchValue({geoColumn: 'WKT'});
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
    this.analyticsService.report('preset', 'stepper', `step ${this.stepIndex}`);
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
    if (!rule.isComputed && rule.value) {
      return 'global';
    }
    if (rule.isComputed && rule.function) {
      return 'computed';
    }
    return 'none';
  }

  getPropStats(propName: string): ColumnStat {
    const group = <FormGroup>this.stylesFormGroup.controls[propName];
    const rawValue = group.value;
    if (!rawValue.property) {
      return null;
    }
    return this.stats.get(rawValue.property);
  }

  getPropFormGroup(propName: string): FormGroup {
    return <FormGroup>this.stylesFormGroup.controls[propName];
  }

  showMessage(message: string, duration: number = 5000) {
    console.warn(message);
    this._ngZone.run(() => {
      this._snackbar.open(message, undefined, {duration: duration});
    });
  }
}

function parseErrorMessage(e, defaultMessage = 'Something went wrong') {
  if (e.message) {
    return e.message;
  }
  if (e.result && e.result.error && e.result.error.message) {
    return e.result.error.message;
  }
  return defaultMessage;
}
