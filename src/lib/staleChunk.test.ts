/**
 * @vitest-environment happy-dom
 *
 * Needs a real sessionStorage: the reload guard is the part that must
 * not misbehave, and stubbing it would be testing the stub.
 */
import { describe, expect, it, vi } from "vitest";
import { isStaleChunkError, recoverFromStaleChunk } from "@/lib/staleChunk";

/**
 * The real message that started this, copied out of error_log:
 * a deploy replaced the chunk filenames while the app was open, the
 * SPA rewrite answered the missing file with index.html, and the
 * browser reported HTML where it wanted a module.
 */
const REAL = new Error(
  "'text/html' is not a valid JavaScript MIME type for module script 'https://acadkit.app/assets/Insights-Bw4BvhjD.js'"
);

describe("isStaleChunkError", () => {
  it("recognises the message this was built for", () => {
    expect(isStaleChunkError(REAL)).toBe(true);
  });

  it("recognises how the other browsers word it", () => {
    for (const m of [
      "Failed to fetch dynamically imported module: https://x/assets/Marks-abc.js",
      "error loading dynamically imported module",
      "Importing a module script failed.",
      "ChunkLoadError: Loading chunk 42 failed.",
      "Loading CSS chunk 7 failed.",
    ]) {
      expect(isStaleChunkError(new Error(m)), m).toBe(true);
      expect(isStaleChunkError(m), m).toBe(true);
    }
  });

  it("leaves real crashes alone", () => {
    // The cost of a false positive is a reload that hides a genuine
    // bug, so this list matters more than the one above.
    for (const m of [
      "Cannot read properties of undefined (reading 'max')",
      "subject.assessment is not a function",
      "Network request failed",
      "Maximum update depth exceeded",
    ]) {
      expect(isStaleChunkError(new Error(m)), m).toBe(false);
    }
    expect(isStaleChunkError(null)).toBe(false);
    expect(isStaleChunkError(undefined)).toBe(false);
    expect(isStaleChunkError({})).toBe(false);
  });
});

describe("recoverFromStaleChunk", () => {
  it("reloads once and then refuses, so it cannot loop", () => {
    sessionStorage.clear();
    const reload = vi.fn();
    expect(recoverFromStaleChunk(reload)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);

    // A second failure inside the cooldown is a broken deploy, not a
    // stale one — the crash screen should show rather than reload again.
    expect(recoverFromStaleChunk(reload)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("still tries when storage is unavailable", () => {
    sessionStorage.clear();
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    const reload = vi.fn();
    // One reload beats a crash screen even with no way to remember it.
    expect(recoverFromStaleChunk(reload)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    getItem.mockRestore();
    setItem.mockRestore();
  });
});
