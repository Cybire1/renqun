// Small async key-value store the client uses to remember event scans and one-time flags.
// Browsers get localStorage; anything else (Node, tests) gets memory. React Native passes
// AsyncStorage through setStorage().
export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

const memory = new Map<string, string>();

const fallback: KeyValueStore = {
  async getItem(key) {
    try {
      const ls = (globalThis as { localStorage?: Storage }).localStorage;
      if (ls) return ls.getItem(key);
    } catch {
      /* private mode */
    }
    return memory.get(key) ?? null;
  },
  async setItem(key, value) {
    try {
      const ls = (globalThis as { localStorage?: Storage }).localStorage;
      if (ls) return ls.setItem(key, value);
    } catch {
      /* quota or private mode */
    }
    memory.set(key, value);
  },
};

export let store: KeyValueStore = fallback;

export function setStorage(next: KeyValueStore): void {
  store = next;
}
