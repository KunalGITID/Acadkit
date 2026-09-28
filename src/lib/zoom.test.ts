import { describe, expect, it } from "vitest";
import {
  MAX_ZOOM,
  MIN_ZOOM,
  baseUnder,
  centreOffset,
  clampZoom,
  easeToward,
  pinchZoom,
  rubberBand,
  scrollFor,
  wheelZoom,
} from "./zoom";

describe("pinchZoom", () => {
  it("resists: spreading twice as far zooms less than twice", () => {
    const z = pinchZoom(1, 2);
    expect(z).toBeGreaterThan(1.5);
    expect(z).toBeLessThan(2);
  });

  it("is continuous from where the pinch started", () => {
    expect(pinchZoom(2, 1)).toBe(2);
    expect(pinchZoom(2, 0.5)).toBeLessThan(2);
  });

  it("rubber-bands past the limits instead of stopping", () => {
    const over = pinchZoom(MAX_ZOOM, 2);
    expect(over).toBeGreaterThan(MAX_ZOOM);
    expect(over).toBeLessThan(MAX_ZOOM * 1.3);
    const under = pinchZoom(MIN_ZOOM, 0.5);
    expect(under).toBeLessThan(MIN_ZOOM);
    expect(under).toBeGreaterThan(0.7);
  });

  it("ignores a degenerate pinch", () => {
    expect(pinchZoom(1.5, 0)).toBe(1.5);
    expect(pinchZoom(1.5, NaN)).toBe(1.5);
  });
});

describe("rubberBand and clampZoom", () => {
  it("leaves values inside the range alone", () => {
    expect(rubberBand(2)).toBe(2);
    expect(clampZoom(2)).toBe(2);
  });
  it("clamps for the settle", () => {
    expect(clampZoom(9)).toBe(MAX_ZOOM);
    expect(clampZoom(0.2)).toBe(MIN_ZOOM);
  });
});

describe("wheelZoom", () => {
  it("zooms in on a negative delta and out on a positive one, within the limits", () => {
    expect(wheelZoom(1, -10)).toBeGreaterThan(1);
    expect(wheelZoom(2, 10)).toBeLessThan(2);
    expect(wheelZoom(1, 10)).toBe(MIN_ZOOM);
    expect(wheelZoom(MAX_ZOOM, -50)).toBe(MAX_ZOOM);
  });
});

describe("easeToward", () => {
  it("covers part of the way each frame and lands exactly", () => {
    let z = 1;
    const seen: number[] = [];
    for (let i = 0; i < 60 && z !== 2; i++) seen.push((z = easeToward(z, 2)));
    expect(seen[0]).toBeGreaterThan(1);
    expect(seen[0]).toBeLessThan(1.5);
    expect(z).toBe(2);
    // Smooth: never overshoots.
    expect(seen.every((v) => v <= 2)).toBe(true);
  });
});

describe("focal point", () => {
  it("keeps the point under the fingers put as the zoom changes", () => {
    // At 1×, scrolled 100, fingers at 150: content point 250.
    const base = baseUnder(100, 1, 0, 150);
    expect(base).toBe(250);
    // At 2× the same point is at 500; to keep it at 150, scroll 350.
    expect(scrollFor(base, 2, 0, 150)).toBe(350);
    // And back.
    expect(baseUnder(350, 2, 0, 150)).toBe(250);
  });

  it("accounts for the centring inset", () => {
    const off = centreOffset(1000, 600);
    expect(off).toBe(200);
    const base = baseUnder(0, 1, off, 500);
    expect(base).toBe(300);
    expect(scrollFor(base, 1, off, 500)).toBe(0);
    expect(centreOffset(400, 600)).toBe(0);
  });
});
