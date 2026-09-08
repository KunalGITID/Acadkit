import { describe, expect, it } from "vitest";
import { describeRangePlan, planRangeMarks } from "@/lib/rangeMark";
import type { AttendanceRecord, TimetableSlot } from "@/types";

/** Day orders 1–5 on five consecutive weekdays. */
const EFF = {
  "2026-07-21": 1,
  "2026-07-22": 2,
  "2026-07-23": 3,
  "2026-07-24": 4,
  "2026-07-27": 5,
};

const slot = (subjectId: string, dayOrder: number, start: string): TimetableSlot =>
  ({
    id: `${subjectId}${dayOrder}${start}`,
    subject_id: subjectId,
    day_order: dayOrder,
    start_time: `${start}:00`,
    end_time: `${start}:00`,
  }) as TimetableSlot;

/** DSA on day orders 1 and 3, OS on 1 — four classes across the week. */
const TIMETABLE = [
  slot("dsa", 1, "08:00"),
  slot("os", 1, "09:00"),
  slot("dsa", 3, "08:00"),
  slot("os", 5, "08:00"),
];

const record = (subjectId: string, date: string, start: string): AttendanceRecord =>
  ({ subject_id: subjectId, date, start_time: `${start}:00`, status: "present" }) as AttendanceRecord;

const plan = (over: Partial<Parameters<typeof planRangeMarks>[0]> = {}) =>
  planRangeMarks({
    from: "2026-07-21",
    to: "2026-07-27",
    timetable: TIMETABLE,
    effMap: EFF,
    attendance: [],
    ...over,
  });

describe("planRangeMarks", () => {
  it("covers every scheduled class across the range", () => {
    const p = plan();
    expect(p.marks).toHaveLength(4);
    expect(p.days).toBe(5);
    expect(p.alreadyMarked).toBe(0);
  });

  it("stays inside the range it was given", () => {
    expect(plan({ to: "2026-07-22" }).marks.map((m) => m.date)).toEqual([
      "2026-07-21",
      "2026-07-21",
    ]);
  });

  it("reads a range entered backwards the way it was obviously meant", () => {
    expect(plan({ from: "2026-07-27", to: "2026-07-21" }).marks).toHaveLength(4);
  });

  it("narrows to one subject when asked", () => {
    const p = plan({ subjectId: "dsa" });
    expect(p.marks).toHaveLength(2);
    expect(p.marks.every((m) => m.subject_id === "dsa")).toBe(true);
    // The days are still the days: a range with no DSA in it isn't
    // a shorter range, it's the same one with less in it.
    expect(p.days).toBe(5);
  });

  /**
   * The rule that makes this safe to run twice: an answer you gave by
   * hand is never quietly replaced by a bulk action.
   */
  it("leaves an answer you already gave alone", () => {
    const p = plan({ attendance: [record("dsa", "2026-07-21", "08:00")] });
    expect(p.marks).toHaveLength(3);
    expect(p.alreadyMarked).toBe(1);
    expect(p.marks.some((m) => m.subject_id === "dsa" && m.date === "2026-07-21")).toBe(false);
  });

  it("overwrites only when replacing is asked for", () => {
    const p = plan({ attendance: [record("dsa", "2026-07-21", "08:00")], replace: true });
    expect(p.marks).toHaveLength(4);
    expect(p.alreadyMarked).toBe(1);
  });

  it("never invents a class on a day the calendar doesn't have", () => {
    // The weekend between the 24th and the 27th isn't in the map at all.
    expect(plan({ from: "2026-07-25", to: "2026-07-26" }).marks).toEqual([]);
    expect(plan({ from: "2026-07-25", to: "2026-07-26" }).days).toBe(0);
  });
});

describe("describeRangePlan", () => {
  it("says exactly what is about to happen, before it happens", () => {
    expect(describeRangePlan(plan(), "absent")).toBe("Mark 4 classes absent across 5 days.");
    expect(describeRangePlan(plan({ to: "2026-07-21" }), "od")).toBe(
      "Mark 2 classes on duty across 1 day."
    );
  });

  it("accounts for what it is leaving alone", () => {
    const p = plan({ attendance: [record("dsa", "2026-07-21", "08:00")] });
    expect(describeRangePlan(p, "absent")).toMatch(/1 already-marked class left alone\./);
  });

  it("distinguishes a full range from an empty one", () => {
    const all = plan({
      attendance: [
        record("dsa", "2026-07-21", "08:00"),
        record("os", "2026-07-21", "09:00"),
        record("dsa", "2026-07-23", "08:00"),
        record("os", "2026-07-27", "08:00"),
      ],
    });
    expect(describeRangePlan(all, "present")).toMatch(/already marked/);
    expect(describeRangePlan(plan({ from: "2026-07-25", to: "2026-07-26" }), "present")).toMatch(
      /No working days/
    );
    expect(describeRangePlan(plan({ subjectId: "none" }), "present")).toMatch(/No classes/);
  });
});
