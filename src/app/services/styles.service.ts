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

import * as d3Scale from 'd3-scale';
import * as d3Color from 'd3-color';

export interface StyleRule {
  isComputed: boolean;
  value: string;
  property: string;
  function: string;
  domain: string[];
  range: string[];
}

const DEFAULT_STYLES = {
  fillColor: '#ff0000',
  fillOpacity: 1.0,
  strokeColor: '#000000',
  strokeOpacity: 1.0,
  strokeWeight: 1.0,
  circleRadius: 5
};

const parseNumber = Number;
const parseBoolean = (v) => !!String(v).match(/y|1|t/gi);
const parseColorString = (v) => {
  const color = d3Color.color(v);
  return color ? String(color) : DEFAULT_STYLES.fillColor;
};

export interface StyleProp {
  name: string;
  type: string;
  description: string;
  parse: (i: string) => any;
}

export const StyleProps: Array<StyleProp> = [
  {
    name: 'fillColor',
    type: 'color',
    parse: parseColorString,
    description: ''
      + 'Fill color of a polygon or point. For example, "linear" or "interval" functions may be used'
      + ' to map numeric values to a color gradient.'
  },
  {
    name: 'fillOpacity',
    type: 'number',
    parse: parseNumber,
    description: ''
      + 'Fill opacity of a polygon or point. Values must be in the range 0—1, where 0=transparent'
      + ' and 1=opaque.'
  },
  {
    name: 'strokeColor',
    type: 'color',
    parse: parseColorString,
    description: 'Stroke/outline color of a polygon or line.'},
  {
    name: 'strokeOpacity',
    type: 'number',
    parse: parseNumber,
    description: ''
      + 'Stroke/outline opacity of polygon or line. Values must be in the range 0—1, where'
      + ' 0=transparent and 1=opaque.'
  },
  {
    name: 'strokeWeight',
    type: 'number',
    parse: parseNumber,
    description: 'Stroke/outline width, in pixels, of a polygon or line.'},
  {
    name: 'circleRadius',
    type: 'number',
    parse: parseNumber,
    description: ''
      + 'Radius of the circle representing a point, in pixels. For example, a "linear" function'
      + ' could be used to map numeric values to point sizes, creating a scatterplot style.'
    }
];

export const StyleFunctions = [
  {
    name: 'identity',
    description: 'Data value of each field is used, verbatim, as the styling value.'},
  {
    name: 'categorical',
    description: 'Data values of each field listed in the domain are mapped 1:1 with corresponding styles in the range.'},
  {
    name: 'interval',
    description: ''
      + 'Data values of each field are rounded down to the nearest value in the domain, then styled'
      + ' with the corresponding style in the range.'
  },
  {
    name: 'linear',
    description: ''
      + 'Data values of each field are interpolated linearly across values in the domain, then'
      + ' styled with a blend of the corresponding styles in the range.'
  },
  {
    name: 'exponential',
    disabled: true,
    description: ''
      + 'Data values of each field are interpolated exponentially across values in the domain,'
      + ' then styled with a blend of the corresponding styles in the range.'
    },
];

export class StylesService {
  iconCache: Map<string, google.maps.Icon> = new Map();
  imageCache: Map<string, string> = new Map();
  scaleCache: Map<Object, d3Scale.ScaleOrdinal<any, any> | d3Scale.ScaleLinear<number, any> | d3Scale.ScaleThreshold<number, any>>
    = new Map();

  constructor () {

  }

  uncache () {
    this.scaleCache.clear();
  }

  parseStyle (propName: string, row: Object, rule: StyleRule) {
    const prop = StyleProps.find((p) => p.name === propName);
    let scale = this.scaleCache.get(rule);

    if (!rule.isComputed) {
      // Static value.
      return rule.value
        ? prop.parse(rule.value)
        : DEFAULT_STYLES[propName];

    } else if (!rule.property || !rule.function) {
      // Default value.
      return DEFAULT_STYLES[propName];

    } else if (rule.function === 'identity') {
      // Identity function.
      return prop.parse(row[rule.property]);

    } else if (rule.function === 'categorical') {
      // Categorical function.
      if (!scale) {
        const range = <any[]> rule.range.map((v) => prop.parse(v));
        scale = d3Scale.scaleOrdinal<string>()
          .domain(rule.domain)
          .range(range)
          .unknown(DEFAULT_STYLES[propName]);
        this.scaleCache.set(rule, scale);
      }
      const callableScale = scale as (any) => any;
      return callableScale(row[rule.property]);

    } else if (rule.function === 'interval') {
      // Interval function.
      if (!scale) {
        const range = <any[]> rule.range.map((v) => prop.parse(v));
        const tmpScale = d3Scale.scaleThreshold<number, any>()
          .domain(rule.domain.map(Number))
          .range([...range, DEFAULT_STYLES[propName]]);
        scale = tmpScale as any as d3Scale.ScaleThreshold<number, any>;
        this.scaleCache.set(rule, scale);
      }
      const callableScale = scale as (number) => any;
      return callableScale(Number(row[rule.property]));

    } else if (rule.function === 'linear') {
      // Linear function.
      if (!scale) {
        const range = <any[]> rule.range.map((v) => prop.parse(v));
        scale = d3Scale.scaleLinear<number, any>()
          .domain(rule.domain.map(Number))
          .range(range);
        this.scaleCache.set(rule, scale);
      }
      const callableScale = scale as (number) => any;
      return callableScale(Number(row[rule.property]));

    }
    throw new Error('Unknown style rule function: ' + rule.function);
  }

  getIcon (radius: number, color: string, opacity: number) {
    const iconCacheKey = `${radius}:${color}:${opacity}`;
    const imageCacheKey = `${color}:${opacity}`;

    // Use cached icon if available.
    if (this.iconCache.has(iconCacheKey)) { return this.iconCache.get(iconCacheKey); }

    // Use large, scaled icon rather than new image for each size.
    const iconRadius = 256;
    const iconWidth = 512;

    // Used cached image if available.
    if (!this.imageCache.has(imageCacheKey)) {
      // Parse color and apply opacity.
      const parsedColor = d3Color.color(color);
      parsedColor.opacity = opacity;

      // Create canvas and render circle.
      const canvas = document.createElement('canvas');
      canvas.height = canvas.width = iconWidth;
      const ctx = canvas.getContext('2d');
      ctx.beginPath();
      ctx.arc(iconRadius, iconRadius, iconRadius - 0.5, 0, Math.PI * 2);
      ctx.fillStyle = String(parsedColor);
      ctx.strokeStyle = null;
      ctx.fill();

      // Cache the image.
      this.imageCache.set(imageCacheKey, canvas.toDataURL());
    }

    // Cache and return result.
    const icon = {
      url: this.imageCache.get(imageCacheKey),
      size: new google.maps.Size(iconWidth, iconWidth),
      scaledSize: new google.maps.Size(radius * 2, radius * 2),
      anchor: new google.maps.Point(radius, radius)
    };
    this.iconCache.set(iconCacheKey, icon);
    return icon;
  }
}
