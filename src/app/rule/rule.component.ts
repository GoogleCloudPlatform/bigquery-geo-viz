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

import { Component, forwardRef, Input, OnInit } from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormControl,
  FormGroup,
  NG_VALUE_ACCESSOR,
  NG_VALIDATORS
} from '@angular/forms';
import { StyleFunctions, StyleProp, StyleRule } from '../services/styles.service';
import { ColumnStat } from '../services/bigquery.service';
import { PALETTES } from '../app.constants';

/**
 * Custom form control for a single style rule.
 */
@Component({
  selector: 'app-rule-input',
  templateUrl: './rule.component.html',
  styleUrls: ['./rule.component.css'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => RuleInputComponent),
      multi: true
    },
    {
      provide: NG_VALIDATORS,
      useExisting: forwardRef(() => RuleInputComponent),
      multi: true,
    }
  ]
})
export class RuleInputComponent implements OnInit {
  StyleFunctions = StyleFunctions;

  @Input() formGroup: FormGroup;
  @Input() prop: StyleProp;
  @Input() stats: ColumnStat;
  @Input() columns: Array<string> = [];

  private _rule: StyleRule = {
    isComputed: false,
    value: '',
    function: '',
    property: '',
    domain: [],
    range: []
  };

  onChange = (rule: StyleRule) => {};
  onTouched = (rule: StyleRule) => {};

  public validate(c: FormControl) {
    return null;
  }

  ngOnInit() {
    // Reflect FormGroup changes to local object used to update view.
    this.formGroup.valueChanges.subscribe(() => {
      Object.assign(this._rule, this.formGroup.getRawValue());
    });
  }

  writeValue(rule: StyleRule): void {
    Object.assign(this._rule, rule);
    this.formGroup.patchValue(rule);
    this.onChange(rule);
  }

  registerOnChange(fn: (rule: StyleRule) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  getDomainControls(): AbstractControl[] {
    const array = <FormArray> this.formGroup.controls.domain;
    return array.controls;
  }

  getRangeControls(): AbstractControl[] {
    const array = <FormArray> this.formGroup.controls.range;
    return array.controls;
  }

  addDomainRangeValue() {
    const control = new FormControl('');
    const domainArray = <FormArray> this.formGroup.controls.domain;
    const rangeArray = <FormArray> this.formGroup.controls.range;
    domainArray.push(new FormControl(''));
    rangeArray.push(new FormControl(''));
  }

  removeDomainRangeValue():  void {
    const domain = <FormArray> this.formGroup.controls.domain;
    const range = <FormArray> this.formGroup.controls.range;
    domain.removeAt(domain.length - 1);
    range.removeAt(range.length - 1);
  }

  /**
   * Whether this rule has enough information to be used.
   */
  isPropEnabled(): boolean {
    const rule = this._rule;
    if (!rule.isComputed && rule.value) { return true; }
    if (rule.isComputed && rule.function) { return true; }
    return false;
  }

  /**
   * Whether this rule requires domain/range mappings.
   */
  getPropNeedsMapping(): boolean {
    return this._rule.function && this._rule.function !== 'identity';
  }

  /**
   * Replaces current color palette with a random one.
   */
  addRandomColors() {
    const palette = PALETTES[Math.floor(Math.random() * PALETTES.length)];
    const range = <FormArray> this.formGroup.controls.range;
    if (range.length < 3) {
      range.setValue(palette[3].slice(0, range.length));
    } else if (range.length < 10) {
      range.setValue(palette[range.length]);
    } else {
      console.warn('No palettes available for 10+ colors.');
    }
  }

  /**
   * ngx-color-picker doesn't support Reactive Forms, so use a change
   * handler to update the form.
   */
  onColorChange() {
    this.writeValue(this.formGroup.getRawValue());
  }
}
