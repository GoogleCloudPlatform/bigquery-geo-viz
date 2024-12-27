/**
 * MIT License, Copyright (c) 2016 Simon Babay and Google.
 *
 * Source: https://github.com/chymz/ng2-codemirror
 */

import {Component, Input, Output, ViewChild, EventEmitter, forwardRef} from '@angular/core';
import {NG_VALUE_ACCESSOR} from '@angular/forms';
import * as CodeMirror from 'codemirror';

export type CodeEditorMode = 'sql';

/**
 * CodeMirror component
 * Usage :
 * <codemirror [(ngModel)]="data" [config]="{...}"></ckeditor>
 */
@Component({
  selector: 'codemirror',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CodemirrorComponent),
      multi: true
    }
  ],
  template: `<textarea #host></textarea>`,
  styleUrls: ['./codemirror.component.css']
})
export class CodemirrorComponent {
  @Input()
  mode: CodeEditorMode = 'sql';

  @Output() change = new EventEmitter();
  @Output() query = new EventEmitter();
  editor;
  @ViewChild('host', {static: true}) host: any;

  _value = '';
  @Output() instance = null;

  /**
   * Constructor
   */
  constructor() {
  }

  get value(): any {
    return this._value;
  }

  @Input() set value(v) {
    if (v !== this._value) {
      this._value = v;
      this.onChange(v);
    }
  }

  /**
   * On component destroy
   */
  ngOnDestroy() {
  }

  /**
   * On component view init
   */
  ngAfterViewInit() {
    this.instance = CodeMirror.fromTextArea(
      this.host.nativeElement,
      {
        value: this.value ? this.value : '',
        mode: this.mode,
        lineNumbers: true,
        lineWrapping: true
      }
    );

    this.instance.on('change', () => {
      this.updateValue(this.instance.getValue());
    });

    this.instance.setOption('extraKeys', {
      'Ctrl-Enter': () => {
        this.query.emit(true);
      }
    });
  }

  /**
   * Value update process
   */
  updateValue(value) {
    this.value = value;
    this.onChange(value);
    this.onTouched();
    this.change.emit(value);
  }

  /**
   * Implements ControlValueAccessor
   */
  writeValue(value) {
    this._value = value || '';
    if (this.instance) {
      this.instance.setValue(this._value);
    }
  }

  onChange(_) {
  }

  onTouched() {
  }

  registerOnChange(fn) {
    this.onChange = fn;
  }

  registerOnTouched(fn) {
    this.onTouched = fn;
  }
}


