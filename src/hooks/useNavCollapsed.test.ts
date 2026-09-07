import { describe, expect, it } from "vitest";
import { navCollapseDecision, NAV_DEAD_ZONE, NAV_TOP_ZONE } from "@/hooks/useNavCollapsed";

/**
 * Scroll behaviour breaks silently and nobody notices until the bar
 * won't come back. The decision is exported as a pure function for
 * exactly that reason: mounting the hook would need a DOM testing
 * library this project doesn't carry, and the three rules below are the
 * whole behaviour anyway.
 */
describe("navCollapseDecision", () => {
  it("stays whole anywhere near the top of a page", () => {
    expect(navCollapseDecision(0, 40, false)).toBe(false);
    expect(navCollapseDecision(NAV_TOP_ZONE, 40, true)).toBe(false);
    expect(navCollapseDecision(NAV_TOP_ZONE + 1, 40, false)).toBe(true);
  });

  it("collapses going down and returns coming up", () => {
    expect(navCollapseDecision(500, 30, false)).toBe(true);
    expect(navCollapseDecision(500, -30, true)).toBe(false);
  });

  it("ignores a finger resting on a scrolling screen", () => {
    // Sub-threshold jitter must not flicker the bar in either direction.
    expect(navCollapseDecision(500, NAV_DEAD_ZONE - 1, false)).toBe(false);
    expect(navCollapseDecision(500, -(NAV_DEAD_ZONE - 1), true)).toBe(true);
    expect(navCollapseDecision(500, 0, true)).toBe(true);
  });

  it("treats a rubber-band overscroll as the top, not an upward flick", () => {
    // iOS reports a negative offset past the top of the document.
    expect(navCollapseDecision(-80, 40, true)).toBe(false);
  });

  it("cannot leave the bar collapsed at the very top", () => {
    expect(navCollapseDecision(0, 100, true)).toBe(false);
    expect(navCollapseDecision(0, -100, true)).toBe(false);
  });
});
