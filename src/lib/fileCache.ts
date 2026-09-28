/** Study files kept on this device, so opening one you've opened before costs no download at all - and works with no signal. */

const CACHE = "acadkit-files-v1";
const INDEX = "acadkit:file-cache";
/** What the cache may hold before the least recently opened files go. */
export const CAP_BYTES = 400 * 1024 * 1024;

export interface CacheEntry {
  size: number;
  /** Last opened, ms since epoch. */
  used: number;
}
export type CacheIndex = Record<string, CacheEntry>;

/** Keys to drop so the cache fits `cap`: least recently opened first. */
export function evictionPlan(index: CacheIndex, cap = CAP_BYTES): string[] {
  let total = Object.values(index).reduce((s, e) => s + e.size, 0);
  const out: string[] = [];
  for (const [key, e] of Object.entries(index).sort((a, b) => a[1].used - b[1].used)) {
    if (total <= cap) break;
    out.push(key);
    total -= e.size;
  }
  return out;
}

function readIndex(): CacheIndex {
  try {
    return JSON.parse(localStorage.getItem(INDEX) ?? "{}") as CacheIndex;
  } catch {
    return {};
  }
}
function writeIndex(index: CacheIndex) {
  try {
    localStorage.setItem(INDEX, JSON.stringify(index));
  } catch {
    // Storage full or disabled: the cache still works, it just can't evict well.
  }
}

/** A same-origin URL the cache files a key under. Never fetched from the network. */
const urlFor = (key: string) => `/__study-file/${encodeURIComponent(key)}`;

function available(): boolean {
  return typeof caches !== "undefined";
}

/** The cached copy of `key`, or null. */
export async function cachedFile(key: string): Promise<Blob | null> {
  if (!available()) return null;
  try {
    const hit = await (await caches.open(CACHE)).match(urlFor(key));
    if (!hit) return null;
    const blob = await hit.blob();
    const index = readIndex();
    index[key] = { size: blob.size, used: Date.now() };
    writeIndex(index);
    return blob;
  } catch {
    return null;
  }
}

/** Keep `blob` under `key`, then trim the cache to size. Never throws. */
export async function storeFile(key: string, blob: Blob): Promise<void> {
  if (!available() || blob.size > CAP_BYTES / 4) return;
  try {
    const cache = await caches.open(CACHE);
    await cache.put(urlFor(key), new Response(blob, { headers: { "content-type": blob.type || "application/octet-stream" } }));
    const index = readIndex();
    index[key] = { size: blob.size, used: Date.now() };
    for (const gone of evictionPlan(index)) {
      await cache.delete(urlFor(gone));
      delete index[gone];
    }
    writeIndex(index);
  } catch {
    // Quota, private mode: opening still works, just not from disk next time.
  }
}

/** Drop every cached file (sign-out). */
export async function clearFileCache(): Promise<void> {
  try {
    localStorage.removeItem(INDEX);
  } catch {
    // ignore
  }
  if (available()) await caches.delete(CACHE).catch(() => false);
}
