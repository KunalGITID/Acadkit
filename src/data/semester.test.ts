/** The edge function can't import from src/, so it carries a generated mirror of the academic calendar. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { OFFICIAL_HOLIDAYS } from "@/data/semester";

const GENERATED = resolve(
  __dirname,
  "../../supabase/functions/send-reminders/calendar.generated.ts"
);

const src = readFileSync(GENERATED, "utf8");

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
  it("mirrors every official holiday", () => {
    expect(stringMap(section("OFFICIAL_HOLIDAYS"))).toEqual(OFFICIAL_HOLIDAYS);
  });

  it("no longer bakes a day-order map", () => {
    // It used to.
    expect(src).not.toContain("DAY_ORDER_MAP");
    expect(src).not.toContain("SEMESTER_END");
  });

  it("is marked as generated so nobody hand-edits it", () => {
    expect(src).toContain("GENERATED FILE - DO NOT EDIT");
  });
});
