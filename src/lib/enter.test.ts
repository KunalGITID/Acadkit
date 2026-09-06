import { describe, expect, it } from "vitest";
import { listEntry, STAGGER_CAP, STAGGER_STEP } from "@/lib/enter";

describe("listEntry", () => {
  it("staggers by position while the list is new", () => {
    expect(listEntry(0, false).transition?.delay).toBe(0);
    expect(listEntry(3, false).transition?.delay).toBeCloseTo(3 * STAGGER_STEP);
  });

  /**
   * Uncapped, the twentieth subject waits most of a second for a
   * gesture that already finished — which reads as the app being slow,
   * not as choreography.
   */
  it("stops stretching once the list is long", () => {
    const late = listEntry(40, false).transition?.delay;
    expect(late).toBeCloseTo(STAGGER_CAP * STAGGER_STEP);
    expect(late).toBeLessThan(0.4);
  });

  it("is inert on a list that has already played", () => {
    const again = listEntry(5, true);
    expect(again.initial).toBe(false);
    expect(again.animate).toBeUndefined();
    expect(again.transition).toBeUndefined();
  });
});
