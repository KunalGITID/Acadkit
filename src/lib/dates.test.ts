import { describe, expect, it } from "vitest";
import { addDays, diffDays, isWeekend, parseISODate, relativeDay, toISODate } from "@/lib/dates";

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

describe("relativeDay", () => {
  const from = new Date("2026-09-10T12:00:00");

  it("names the recent past rather than making you subtract", () => {
    expect(relativeDay("2026-09-10", from)).toBe("today");
    expect(relativeDay("2026-09-09", from)).toBe("yesterday");
    expect(relativeDay("2026-09-07", from)).toBe("3 days ago");
  });

  it("falls back to the date once counting stops helping", () => {
    // "37 days ago" is harder to place than the date itself.
    expect(relativeDay("2026-08-04", from)).toMatch(/^on /);
  });

  it("treats a future date as today rather than showing a negative", () => {
    expect(relativeDay("2026-09-12", from)).toBe("today");
  });
});
