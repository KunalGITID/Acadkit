import { describe, expect, it } from "vitest";
import { addDays, diffDays, isWeekend, toISODate, parseISODate } from "@/lib/dates";

describe("dates", () => {
  it("formats a Date to local ISO", () => {
    expect(toISODate(new Date(2026, 6, 21))).toBe("2026-07-21");
  });

  it("round-trips parse/format", () => {
    expect(toISODate(parseISODate("2026-11-18"))).toBe("2026-11-18");
  });

  it("adds days across month boundaries", () => {
    expect(addDays("2026-07-31", 1)).toBe("2026-08-01");
    expect(addDays("2026-07-21", -1)).toBe("2026-07-20");
  });

  it("detects weekends", () => {
    expect(isWeekend("2026-07-25")).toBe(true); // Saturday
    expect(isWeekend("2026-07-26")).toBe(true); // Sunday
    expect(isWeekend("2026-07-21")).toBe(false); // Tuesday
  });

  it("diffs days", () => {
    expect(diffDays("2026-07-21", "2026-07-28")).toBe(7);
    expect(diffDays("2026-07-28", "2026-07-21")).toBe(-7);
  });
});
