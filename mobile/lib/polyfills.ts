// Must be imported FIRST (index.ts). viem and @noble/hashes need these on Hermes.
import 'react-native-get-random-values';
import 'fast-text-encoding';
import { Buffer } from 'buffer';

// Intl.PluralRules is MISSING on Hermes. The full @formatjs polyfill itself crashes under
// Hermes ("prototype of undefined" in its own constructor), so install a tiny dependency-free
// shim (English cardinal + ordinal) as a safety net for any library that formats with it.
const intl = ((globalThis as unknown as { Intl: Record<string, unknown> }).Intl ??= {} as Record<string, unknown>);
if (typeof intl.PluralRules === 'undefined') {
  intl.PluralRules = class PluralRules {
    _type: string;
    constructor(_locales?: unknown, options?: { type?: string }) {
      this._type = options?.type ?? 'cardinal';
    }
    select(n: number): string {
      n = Math.abs(Number(n) || 0);
      if (this._type === 'ordinal') {
        const m10 = n % 10;
        const m100 = n % 100;
        if (m10 === 1 && m100 !== 11) return 'one';
        if (m10 === 2 && m100 !== 12) return 'two';
        if (m10 === 3 && m100 !== 13) return 'few';
        return 'other';
      }
      return n === 1 ? 'one' : 'other';
    }
    resolvedOptions() {
      return { locale: 'en-US', type: this._type, pluralCategories: ['one', 'two', 'few', 'other'] };
    }
    static supportedLocalesOf(locales: string | string[]) {
      return Array.isArray(locales) ? locales.slice() : [locales];
    }
  };
}

const g = globalThis as unknown as Record<string, unknown>;
if (typeof g.Buffer === 'undefined') {
  g.Buffer = Buffer;
}

// AbortSignal.timeout() is MISSING on Hermes (the static method is newer than the RN runtime).
// Our fetch helpers use it for request timeouts — without this, every fetch throws
// "AbortSignal.timeout is not a function" and markets/quotes/leaderboard never load.
const AS = (globalThis as unknown as { AbortSignal?: { timeout?: unknown } }).AbortSignal;
if (AS && typeof AS.timeout !== 'function') {
  (AS as { timeout: (ms: number) => AbortSignal }).timeout = (ms: number) => {
    const c = new AbortController();
    setTimeout(() => c.abort(new Error('TimeoutError')), ms);
    return c.signal;
  };
}
