/**
 * Polyfills for Older Android Browsers (Android 5+, Chrome 55+, Samsung Internet, Android WebView)
 * Ensures modern JavaScript features and DOM APIs do not throw fatal exceptions on legacy devices.
 */

// 1. globalThis polyfill (Chrome < 71, Safari < 12.1)
if (typeof globalThis === 'undefined') {
  try {
    Object.defineProperty(Object.prototype, '__magic__', {
      get() {
        return this;
      },
      configurable: true,
    });
    // @ts-ignore
    __magic__.globalThis = __magic__;
    // @ts-ignore
    delete Object.prototype.__magic__;
  } catch {
    (window as any).globalThis = window;
  }
}

// 2. crypto.randomUUID polyfill (Chrome < 92, Samsung Internet < 16, older Android WebView)
if (typeof window !== 'undefined') {
  if (!window.crypto) {
    (window as any).crypto = {};
  }
  if (!window.crypto.randomUUID) {
    (window.crypto as any).randomUUID = function (): string {
      try {
        if (window.crypto.getRandomValues) {
          const buf = new Uint8Array(16);
          window.crypto.getRandomValues(buf);
          buf[6] = (buf[6] & 0x0f) | 0x40;
          buf[8] = (buf[8] & 0x3f) | 0x80;
          const hex = Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
          return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
        }
      } catch {}
      // Fallback Math.random
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    };
  }
}

// 3. Object.fromEntries polyfill (Chrome < 73)
if (!Object.fromEntries) {
  Object.fromEntries = function (iterable: any): any {
    const obj: Record<string, any> = {};
    if (!iterable) return obj;
    for (const [key, val] of iterable) {
      obj[key] = val;
    }
    return obj;
  };
}

// 4. Array.prototype.flat & flatMap polyfill (Chrome < 69)
if (!Array.prototype.flat) {
  (Array.prototype as any).flat = function (this: any[], depth = 1): any[] {
    return depth > 0
      ? this.reduce(
          (acc: any[], val: any) =>
            acc.concat(Array.isArray(val) ? (val as any).flat(depth - 1) : val),
          []
        )
      : this.slice();
  };
}

if (!Array.prototype.flatMap) {
  (Array.prototype as any).flatMap = function (this: any[], fn: any, thisArg?: any): any[] {
    return (this.map(fn, thisArg) as any).flat();
  };
}

// 5. Array.prototype.at & String.prototype.at polyfill (Chrome < 92)
function atPolyfill(this: any, n: number) {
  n = Math.trunc(n) || 0;
  if (n < 0) n += this.length;
  if (n < 0 || n >= this.length) return undefined;
  return this[n];
}

if (!Array.prototype.at) {
  Array.prototype.at = atPolyfill;
}

if (!String.prototype.at) {
  String.prototype.at = atPolyfill;
}

// 6. String.prototype.replaceAll polyfill (Chrome < 85)
if (!String.prototype.replaceAll) {
  String.prototype.replaceAll = function (
    searchValue: string | RegExp,
    replaceValue: any
  ): string {
    if (searchValue instanceof RegExp) {
      const flags = searchValue.flags.includes('g')
        ? searchValue.flags
        : searchValue.flags + 'g';
      return this.replace(new RegExp(searchValue.source, flags), replaceValue);
    }
    return this.split(searchValue).join(replaceValue);
  };
}

// 7. Promise.allSettled polyfill (Chrome < 76)
if (!Promise.allSettled) {
  Promise.allSettled = function (promises: Promise<any>[]): Promise<any[]> {
    return Promise.all(
      promises.map((p) =>
        Promise.resolve(p).then(
          (value) => ({ status: 'fulfilled', value }),
          (reason) => ({ status: 'rejected', reason })
        )
      )
    );
  };
}

// 8. structuredClone fallback (Chrome < 98)
if (typeof window !== 'undefined' && !('structuredClone' in window)) {
  (window as any).structuredClone = function (obj: any): any {
    if (obj === undefined) return undefined;
    return JSON.parse(JSON.stringify(obj));
  };
}

// 9. queueMicrotask fallback (Chrome < 71)
if (typeof window !== 'undefined' && !window.queueMicrotask) {
  window.queueMicrotask = function (callback: () => void) {
    Promise.resolve()
      .then(callback)
      .catch((err) =>
        setTimeout(() => {
          throw err;
        }, 0)
      );
  };
}

// 10. In-memory storage cache and fallback if localStorage quota exceeded or disabled
export const memoryStorage: Record<string, string> = {};

export function safeGetItem(key: string): string | null {
  // If memoryStorage has a fresh value (e.g. from recent write or quota fallback), return it immediately
  if (memoryStorage[key] !== undefined) {
    return memoryStorage[key];
  }
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const val = window.localStorage.getItem(key);
      if (val !== null) {
        memoryStorage[key] = val;
        return val;
      }
    }
  } catch {
    // Fallback to memory
  }
  return null;
}

export function safeSetItem(key: string, value: string): void {
  // Always update memory storage first to guarantee synchronous availability in current session
  memoryStorage[key] = value;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
      return;
    }
  } catch {
    // LocalStorage quota exceeded or private mode: free up redundant keys and retry
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const redundantKeys = [
          'spb_records',
          'spb_survey_cache',
          'event_records',
          'event_survey_cache',
          'hajatan_records',
          'hajatan_survey_cache',
        ];
        redundantKeys.forEach((rk) => {
          if (rk !== key) {
            try {
              window.localStorage.removeItem(rk);
            } catch {}
          }
        });
        window.localStorage.setItem(key, value);
      }
    } catch {
      // Memory storage is already populated with the full dataset
    }
  }
}

export function safeRemoveItem(key: string): void {
  delete memoryStorage[key];
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Fallback
  }
}

export default true;
