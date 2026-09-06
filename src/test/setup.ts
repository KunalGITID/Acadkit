/**
 * Test-run globals.
 *
 * `src/store/app.ts` reads the stored PIN at module scope, so anything
 * that imports a component transitively touches `localStorage` before a
 * test body runs. Node 22 exposes a `localStorage` global that is
 * `undefined` unless the process was started with `--localstorage-file`,
 * and happy-dom's own copy arrives too late for a module-scope read —
 * so the shim goes in here, before any module is imported.
 *
 * Deliberately a real in-memory store rather than a no-op: code that
 * writes and reads back within a test should see what it wrote.
 */
function memoryStorage(): Storage {
  let map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => {
      map = new Map();
    },
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => {
      map.delete(k);
    },
    setItem: (k: string, v: string) => {
      map.set(k, String(v));
    },
  } as Storage;
}

if (!globalThis.localStorage?.getItem) {
  Object.defineProperty(globalThis, "localStorage", {
    value: memoryStorage(),
    configurable: true,
    writable: true,
  });
}
