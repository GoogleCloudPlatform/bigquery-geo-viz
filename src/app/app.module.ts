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

import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { CodemirrorModule } from 'ng2-codemirror';
import { NgModule, enableProdMode } from '@angular/core';

import { routes } from './app.routing';
import { RouterModule } from '@angular/router';

import { MatInputModule } from '@angular/material/input';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatStepperModule } from '@angular/material/stepper';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';

import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { AppComponent } from './app.component';
import { MainComponent } from './main/main.component';
import { MapComponent } from './map/map.component';
import { TermsComponent } from './terms/terms.component';
import { RuleInputComponent } from './rule/rule.component';
import { FileSizePipe } from './file-size.pipe';
import { environment } from '../environments/environment';

import {StorageServiceModule} from 'angular-webstorage-service';
import {ColorPickerModule} from 'ngx-color-picker';

if ( environment.production ) {
  enableProdMode();
}

@NgModule({
  declarations: [
    AppComponent,
    MainComponent,
    MapComponent,
    TermsComponent,
    RuleInputComponent,
    FileSizePipe,
  ],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    CodemirrorModule,

    RouterModule.forRoot(routes),

    MatInputModule,
    MatSidenavModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatStepperModule,
    MatSelectModule,
    MatAutocompleteModule,
    MatTableModule,
    MatExpansionModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule,
    MatTooltipModule,
    FormsModule,
    ReactiveFormsModule,
    StorageServiceModule,

    ColorPickerModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
