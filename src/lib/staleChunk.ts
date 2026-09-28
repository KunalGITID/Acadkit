/** Recovering from a deploy that landed under your feet. */

const RELOAD_KEY = "acadkit:chunk-reload";
/** Long enough to cover a reload; short enough not to suppress a real one later. */
const COOLDOWN_MS = 30_000;

/**
 * Every phrasing the browsers use for "the module you asked for isn't
 * there". Chrome, Firefox and Safari each word it differently, and the
 * MIME variant is the one a SPA rewrite produces rather than a 404.
 */
const SIGNATURES = [
  "failed to fetch dynamically imported module",
  "error loading dynamically imported module",
  "importing a module script failed",
  "is not a valid javascript mime type",
  "expected a javascript module script",
  "chunkloaderror",
  "loading chunk",
  "loading css chunk",
];

export function isStaleChunkError(reason: unknown): boolean {
  const message =
    reason instanceof Error
      ? `${reason.name} ${reason.message}`
      : typeof reason === "string"
        ? reason
        : "";
  if (!message) return false;
  const lower = message.toLowerCase();
  return SIGNATURES.some((s) => lower.includes(s));
}

/**
 * Reload to pick up the new build. Returns false when it has already
 * tried recently, so the caller can fall back to showing the crash.
 */
export function recoverFromStaleChunk(reload: () => void = () => location.reload()): boolean {
  // Already reloading this page: the other chunks that fail in the same
  // moment are the same stale document, not crashes. After a deploy the
  // Study page's prefetches used to log ten of them in three seconds.
  if (reloading) return true;
  let last = 0;
  try {
    last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
  } catch {
    // Private mode, or storage disabled. One reload attempt is still
    // better than a crash screen, so carry on with last = 0.
  }
  if (Date.now() - last < COOLDOWN_MS) return false;
  try {
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    /* nothing to do */
  }
  reloading = true;
  reload();
  return true;
}

let reloading = false;

/** Tests only: a fresh page. */
export function resetStaleChunkState(): void {
  reloading = false;
}
