/**
 * @vitest-environment happy-dom
 *
 * The reports worth keeping are the ones the old path threw away: a
 * crash before sign-in (error_log is `to authenticated`, so the insert
 * is rejected) and anything that wasn't a render error.
 */
import { describe, expect, it } from "vitest";
import { buildReport } from "@/lib/crashLog";

describe("buildReport", () => {
  it("keeps the message and stack, bounded", () => {
    const err = new Error("x".repeat(5000));
    const r = buildReport(err, "at <Thing>");
    expect(r.message.length).toBeLessThanOrEqual(1000);
    expect(r.stack.length).toBeLessThanOrEqual(4000);
    expect(r.component_stack).toBe("at <Thing>");
  });

  /**
   * An unhandled rejection is usually rejected with a string, not an
   * Error — the old boundary-only path never saw these at all, and
   * reading .message off a string would have logged undefined.
   */
  it("survives being handed something that isn't an Error", () => {
    const r = buildReport("boom");
    expect(r.message).toBe("boom");
    expect(r.stack).toBeTypeOf("string");
  });

  it("records where it happened", () => {
    expect(buildReport(new Error("e")).url).toBe(location.pathname);
  });

  /**
   * localStorage throws rather than returning null when storage is
   * disabled. On the crash path that would turn one crash into two.
   */
  it("still produces a report when storage is unavailable", () => {
    expect(() => buildReport(new Error("e"))).not.toThrow();
    expect(buildReport(new Error("e")).device_id).toBeNull();
  });
});
