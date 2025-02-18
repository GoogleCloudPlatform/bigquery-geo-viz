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

/**
 * Defer a function call until no further calls after the wait time (in milliseconds).
 */
export function debounce(callback: Function, wait: number) {
    let timeoutId = null;
    return (...args: any) => {
        window.clearTimeout(timeoutId);
        timeoutId = window.setTimeout(() => {
            callback(...args);
        }, wait);
    };
}

export class AnalyticsService {
    /**
     * Benchmark and report a Promise (typically a network call).
     */
    async reportBenchmark(action: string, category: string, promise: Promise<any>) {
        const t0 = performance.now();
        const result = await promise;
        const t1 = performance.now();
        try {
            this.report(action, category, /* label= */ '', Math.round(t1 - t0));
        } catch(e: unknown) {
            console.error(e);
        }
        return result;
    }

    /**
     * Records an event.
     * @param action The event action.
     * @param category The event category.
     * @param label The optional event label.
     * @param value An optional numeric value associated with the event.
     */
    report(action: string, category = '', label: string = '', value = 1) {
        this.send(action, category, label, value);
    }

    /**
     * Sends a Google Analytics request.
     * @param action The event action.
     * @param category The event category.
     * @param label The optional event label.
     * @param value An optional numeric value associated with the event.
     */
    private send(action: string, category: string, label: string, value: number) {
        const payload = {
            'value': value,
        };
        if (category) {
            payload['event_category'] = category;
        }
        if (label) {
            payload['event_label'] = label;
        }
        // Actually send the request.
        this.sendPayload(action, payload);
    }

    /**
     * Sends a Google Analytics request.
     * @param action The event action.
     * @param payload The payload to send.
     */
    private sendPayload(action: string, payload: Object) {
        if (!window['gtag'] || !(window['gtag'] instanceof Function)) {
            return;
        }
        const tracker = window['gtag'];
        try {
            tracker.apply(window, ['event', action, payload]);
        } catch(e: unknown) {
            console.error(e);
        }
    }
}
