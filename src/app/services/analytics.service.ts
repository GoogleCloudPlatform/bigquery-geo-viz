/**
 * Copyright 2025 Google LLC
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

export class AnalyticsService {

    /**
     * Benchmark and report a Promise (typically a network call).
     */
    async benchmark(category: string, label: string, promise: Promise<any>) {
        const t0 = performance.now();
        const result = await promise;
        const t1 = performance.now();
        try {
            this.reportTime(category, label, Math.round(t1 - t0));
        } catch(e: unknown) {
            // Pass.
        }
        return result;
    }

    /**
     * Records an event.
     * @param {string} action The event action.
     * @param {string} category The event category.
     * @param {string=} label The optional event label.
     * @param {number=} value An optional numeric value associated with the event.
     */
    report(action, category, label = undefined, value = 1) {
        this.send_(action, category, label, value);
    }

    /**
     * Measure load time of an action or execution.
     * https://support.google.com/analytics/answer/14239619
     * 
     * @param {string} category The timing category (e.g. 'BigQuery').
     * @param {string=} label A label to add flexibility in
     * @param {number} value The number of milliseconds in elapsed time to
     *     be reported (e.g. 5000).
     */
    private reportTime(category, label, value) {
        this.send_('performance', category, label, value);
    }

    /**
     * Sends a Google Analytics request.
     * @param {string} action The event action.
     * @param {string=} category The event category.
     * @param {string=} label The optional event label.
     * @param {number=} value An optional numeric value associated with the event.
     * @param {string=} name An optional name associated with the event.
     *     event.
     * @private
     */
    send_(action, category = '', label = '', value = 1, name = '') {
        const payload = {
            'value': value,
        };
        if (category) {
            payload['event_category'] = category;
        }
        if (label) {
            payload['event_label'] = label;
        }
        if (name) {
            payload['name'] = name;
        }
        // Actually send the request.
        this.sendPayload_(action, payload);
    }

    /**
     * Sends a Google Analytics request.
     * @param {string} action The event action.
     * @param {!Object} payload The payload to send.
     * @private
     */
    sendPayload_(action, payload) {
        if (!window['gtag'] || !(window['gtag'] instanceof Function)) {
            return;
        }
        const tracker = window['gtag'];
        tracker.apply(window, ['event', action, payload]);
    }
}
