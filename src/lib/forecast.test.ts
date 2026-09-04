import { describe, expect, it } from "vitest";
import { classesPerDayOrder, forecast, remainingDays } from "@/lib/forecast";
import type { TimetableSlot } from "@/types";

const slot = (dayOrder: number): TimetableSlot => ({ day_order: dayOrder }) as TimetableSlot;

describe("classesPerDayOrder", () => {
  it("counts the slots on each day order", () => {
    expect(classesPerDayOrder([slot(1), slot(1), slot(3)])).toEqual({ 1: 2, 3: 1 });
  });

  it("is empty when there is no timetable", () => {
    expect(classesPerDayOrder(undefined)).toEqual({});
  });
});

describe("remainingDays", () => {
  const effMap = {
    "2026-09-05": 1,
    "2026-09-06": 2,
    "2026-09-07": 3,
    "2026-09-08": 1,
  };

  it("takes only the days still to come, in order", () => {
    const days = remainingDays(effMap, { 1: 2, 2: 3, 3: 1 }, "2026-09-06");
    expect(days.map((d) => d.date)).toEqual(["2026-09-07", "2026-09-08"]);
  });

  it("excludes today — it is already under way", () => {
    const days = remainingDays(effMap, { 1: 2, 2: 3, 3: 1 }, "2026-09-07");
    expect(days.map((d) => d.date)).toEqual(["2026-09-08"]);
  });

  it("attaches each day's class count from its day order", () => {
    const days = remainingDays(effMap, { 1: 2, 2: 3, 3: 1 }, "2026-09-06");
    expect(days).toEqual([
      { date: "2026-09-07", classes: 1 },
      { date: "2026-09-08", classes: 2 },
    ]);
  });

  it("keeps a day order with no classes as a zero, not a hole", () => {
    const days = remainingDays(effMap, { 1: 2 }, "2026-09-06");
    expect(days).toEqual([
      { date: "2026-09-07", classes: 0 },
      { date: "2026-09-08", classes: 2 },
    ]);
  });
});

describe("forecast", () => {
  const days = [
    { date: "2026-09-07", classes: 4 },
    { date: "2026-09-08", classes: 6 },
  ];

  it("baselines on attending everything from here, not on today's figure", () => {
    // 70/100 today, 10 classes left. Attending all: 80/110 = 72.7%.
    // Today's 70% would flatter every plan measured against it.
    const f = forecast(70, 100, days, new Set());
    expect(f.baseline).toBeCloseTo(72.727, 2);
    expect(f.projected).toBeCloseTo(72.727, 2);
    expect(f.delta).toBe(0);
  });

  it("charges a skipped day its whole class count", () => {
    // Skipping the 4-class day: 76/110 = 69.09%.
    const f = forecast(70, 100, days, new Set(["2026-09-07"]));
    expect(f.classesSkipped).toBe(4);
    expect(f.projected).toBeCloseTo(69.09, 2);
    expect(f.delta).toBeCloseTo(-3.64, 2);
  });

  it("keeps the denominator fixed — a skipped class still counts as held", () => {
    // This is the whole point: skipping does not shrink the total.
    const f = forecast(70, 100, days, new Set(["2026-09-07", "2026-09-08"]));
    expect(f.projected).toBeCloseTo((70 / 110) * 100, 5);
  });

  it("flags dropping below the minimum", () => {
    expect(forecast(70, 100, days, new Set()).belowMinimum).toBe(true);
    expect(forecast(95, 100, days, new Set()).belowMinimum).toBe(false);
  });

  it("respects a non-default minimum", () => {
    // 105/110 = 95.45%, above 75 but below 96.
    expect(forecast(95, 100, days, new Set(), 96).belowMinimum).toBe(true);
  });

  it("ignores a selected date that is not a remaining day", () => {
    const f = forecast(70, 100, days, new Set(["2026-12-25"]));
    expect(f.classesSkipped).toBe(0);
  });

  it("has no answer when nothing has happened and nothing is left", () => {
    const f = forecast(0, 0, [], new Set());
    expect(f.baseline).toBeNull();
    expect(f.projected).toBeNull();
    expect(f.belowMinimum).toBe(false);
  });

  it("works at the very end of the semester, with no classes left", () => {
    const f = forecast(70, 100, [], new Set());
    expect(f.baseline).toBe(70);
    expect(f.classesRemaining).toBe(0);
  });
});
