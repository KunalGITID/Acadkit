/**
 * The edge function can't import from src/, so it carries a generated
 * mirror of the academic calendar. A mirror that drifts sends push
 * reminders on the wrong days — silently, since nothing else reads it.
 * This test is the guard: if it fails, run
 *
 *   node scripts/gen-edge-calendar.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DAY_ORDER_MAP,
  OFFICIAL_HOLIDAYS,
  SEMESTER_END,
  SEMESTER_START,
} from "@/data/semester";

const GENERATED = resolve(
  __dirname,
  "../../supabase/functions/send-reminders/calendar.generated.ts"
);

const src = readFileSync(GENERATED, "utf8");

/** Pull `"2026-07-21": 1` pairs out of the generated source. */
function numberMap(text: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of text.matchAll(/"(\d{4}-\d{2}-\d{2})":\s*(\d+)/g)) {
    out[m[1]] = Number(m[2]);
  }
  return out;
}

function stringMap(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of text.matchAll(/"(\d{4}-\d{2}-\d{2})":\s*"([^"]+)"/g)) {
    out[m[1]] = m[2];
  }
  return out;
}

function section(name: string): string {
  const start = src.indexOf(`export const ${name}`);
  expect(start, `${name} missing from generated calendar`).toBeGreaterThan(-1);
  return src.slice(start, src.indexOf("};", start));
}

describe("generated edge calendar", () => {
  it("mirrors the semester window", () => {
    expect(src).toContain(`export const SEMESTER_START = "${SEMESTER_START}"`);
    expect(src).toContain(`export const SEMESTER_END = "${SEMESTER_END}"`);
  });

  it("mirrors every official holiday", () => {
    expect(stringMap(section("OFFICIAL_HOLIDAYS"))).toEqual(OFFICIAL_HOLIDAYS);
  });

  it("mirrors every day order", () => {
    expect(numberMap(section("DAY_ORDER_MAP"))).toEqual(DAY_ORDER_MAP);
  });

  it("is marked as generated so nobody hand-edits it", () => {
    expect(src).toContain("GENERATED FILE — DO NOT EDIT");
  });
});
