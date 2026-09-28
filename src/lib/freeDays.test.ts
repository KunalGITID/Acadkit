import { describe, expect, it } from "vitest";
import { freeDayLoss } from "@/lib/freeDays";

const TODAY = "2026-09-07";

describe("freeDayLoss", () => {
  it("says nothing without a baseline", () => {
    // The first plan of a session has nothing to have changed from.
    expect(freeDayLoss(null, { count: 9, date: TODAY })).toBeNull();
  });

  it("reports a day lost", () => {
    expect(freeDayLoss({ count: 10, date: TODAY }, { count: 9, date: TODAY })).toBe(1);
  });

  it("reports several at once", () => {
    // One absence can cost more than one day when it eats a subject's
    // last slack.
    expect(freeDayLoss({ count: 10, date: TODAY }, { count: 7, date: TODAY })).toBe(3);
  });

  it("stays quiet when nothing changed", () => {
    expect(freeDayLoss({ count: 9, date: TODAY }, { count: 9, date: TODAY })).toBeNull();
  });

  it("stays quiet when a day is handed back", () => {
    // Marking a class present can add one; not worth an interruption.
    expect(freeDayLoss({ count: 9, date: TODAY }, { count: 10, date: TODAY })).toBeNull();
  });

  it("stays quiet across a date boundary", () => {
    // Free days are also spent the ordinary way: the day arrives and
    // passes. Comparing across midnight would announce a theft every
    // morning.
    expect(freeDayLoss({ count: 10, date: "2026-09-06" }, { count: 9, date: TODAY })).toBeNull();
  });

  it("still reports the last free day going", () => {
    expect(freeDayLoss({ count: 1, date: TODAY }, { count: 0, date: TODAY })).toBe(1);
  });
});
