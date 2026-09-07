/**
 * Recovering from a deploy that landed under your feet.
 *
 * Every page is `lazy()`-loaded, so the running app fetches a chunk by
 * its hashed filename at the moment you navigate. Deploy in between and
 * that filename is gone: the page in memory asks for the old name, the
 * server no longer has it, and `vercel.json` rewrites the miss to
 * `index.html` — so the browser is handed HTML where it expected a
 * module and throws. Nothing is wrong with the app; it is simply
 * holding a document that has been superseded.
 *
 * An error boundary is the wrong response to that. There is no state to
 * preserve and no decision for anyone to make: the fix is to load the
 * page again, which is the one thing the user was going to be told to
 * do anyway. So it reloads itself, once, and says nothing.
 *
 * Once, because a reload that fails the same way must not become a
 * loop. If the second attempt lands on the same error the crash screen
 * shows normally, which is the correct outcome — at that point it is
 * not a stale chunk, it is a broken deploy, and someone should see it.
 */

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
  reload();
  return true;
}
