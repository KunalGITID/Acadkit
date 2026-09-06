/**
 * The launch animation's premise is that iOS's static launch image and
 * the app's first frame are the same picture. Nothing in the type system
 * connects a build script's constant to a CSS unit, so this does: retune
 * one without the other and the mark visibly jumps at the handoff.
 *
 * Reads the script's source rather than importing it, the way
 * semester.test.ts checks the generated calendar — importing it would
 * drag sharp into the test run for one number.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EXIT_MS,
  MARK_VMIN,
  MIN_VISIBLE_MS,
  SEAM_HOLD_MS,
  WORDMARK_DELAY_MS,
} from "@/lib/launch";

const GENERATOR = resolve(__dirname, "../../scripts/lib/mark.mjs");

function markScale(): number {
  const src = readFileSync(GENERATOR, "utf8");
  const match = src.match(/export const MARK_SCALE = ([\d.]+);/);
  if (!match) throw new Error("MARK_SCALE not found in scripts/lib/mark.mjs");
  return Number(match[1]);
}

describe("launch geometry", () => {
  it("draws the mark at the same scale as the generated iOS launch image", () => {
    expect(MARK_VMIN / 100).toBe(markScale());
  });

  it("leaves room for the whole sequence to play before the earliest exit", () => {
    // The wordmark is the last thing in; it must have arrived and been
    // read before the shutter can start taking it away again.
    expect(SEAM_HOLD_MS + WORDMARK_DELAY_MS + EXIT_MS).toBeLessThan(MIN_VISIBLE_MS);
  });
});

