import { describe, expect, it } from "vitest";
import { formatPrep, prepWindows, totalPrepMinutes } from "@/lib/prep";
import type { TimetableSlot } from "@/types";

const WINDOW = { start: "2026-07-21", end: "2026-08-17" };

const slot = (subjectId: string, dayOrder: number, start: string, end: string): TimetableSlot =>
  ({
    id: `${subjectId}${dayOrder}${start}`,
    subject_id: subjectId,
    day_order: dayOrder,
    start_time: `${start}:00`,
    end_time: `${end}:00`,
  }) as TimetableSlot;

/**
 * Day Order 1: 08:00–08:50, then nothing until 11:00 — a 2h10 hole.
 * Day Order 2: back-to-back, so no window at all.
 */
const TIMETABLE = [
  slot("dsa", 1, "08:00", "08:50"),
  slot("os", 1, "11:00", "11:50"),
  slot("maths", 2, "08:00", "08:50"),
  slot("os", 2, "08:50", "09:40"),
];

// 2026-07-21 is Day Order 1, the 22nd is 2, and so on.
const run = (due: string, extra: Partial<Parameters<typeof prepWindows>[0]> = {}) =>
  prepWindows({ due, from: "2026-07-21", timetable: TIMETABLE, window: WINDOW, ...extra });

describe("prepWindows", () => {
  it("finds the hole between two classes", () => {
    const [w] = run("2026-07-21T23:59:00");
    expect(w).toMatchObject({
      date: "2026-07-21",
      dayOrder: 1,
      start: "08:50",
      end: "11:00",
      minutes: 130,
      afterSubjectId: "dsa",
      beforeSubjectId: "os",
    });
  });

  it("finds nothing on a day with no gaps in it", () => {
    expect(run("2026-07-22T23:59:00").every((w) => w.dayOrder === 1)).toBe(true);
  });

  it("returns every chance between now and the deadline, earliest first", () => {
    const all = run("2026-07-28T09:00:00");
    // Day Order 1 falls on the 21st and again on the 28th; the 28th's
    // window closes at 11:00, after a 09:00 deadline, so it's dropped.
    expect(all.map((w) => w.date)).toEqual(["2026-07-21"]);
    expect(run("2026-07-28T23:59:00").map((w) => w.date)).toEqual(["2026-07-21", "2026-07-28"]);
  });

  it("ignores a window that opens after the thing is already due", () => {
    expect(run("2026-07-21T09:00:00")).toEqual([]);
  });

  it("ignores a window you are already sitting in the far end of", () => {
    expect(run("2026-07-21T23:59:00", { fromMinutes: 10 * 60 })).toEqual([]);
    expect(run("2026-07-21T23:59:00", { fromMinutes: 8 * 60 })).toHaveLength(1);
  });

  it("treats a corridor as a corridor, not a study session", () => {
    const tight = [slot("a", 1, "08:00", "08:50"), slot("b", 1, "09:20", "10:10")];
    expect(prepWindows({ due: "2026-07-21T23:59:00", from: "2026-07-21", timetable: tight, window: WINDOW })).toEqual([]);
    expect(
      prepWindows({
        due: "2026-07-21T23:59:00",
        from: "2026-07-21",
        timetable: tight,
        window: WINDOW,
        minMinutes: 20,
      })
    ).toHaveLength(1);
  });

  it("skips the days a declared holiday takes out", () => {
    const out = prepWindows({
      due: "2026-07-28T23:59:00",
      from: "2026-07-21",
      timetable: TIMETABLE,
      declared: [{ date: "2026-07-21", name: "Strike" }],
      window: WINDOW,
    });
    expect(out.some((w) => w.date === "2026-07-21")).toBe(false);
  });

  it("says nothing about a deadline that has already passed", () => {
    expect(run("2026-07-20T09:00:00")).toEqual([]);
  });

  it("is empty, not broken, on a deadline with no usable date", () => {
    expect(run("not a date")).toEqual([]);
  });
});

describe("formatPrep", () => {
  it("reads the way a gap is spoken about", () => {
    expect(formatPrep(45)).toBe("45 min");
    expect(formatPrep(60)).toBe("1h");
    expect(formatPrep(130)).toBe("2h 10m");
  });
});

describe("totalPrepMinutes", () => {
  it("adds up what you actually have", () => {
    expect(totalPrepMinutes(run("2026-07-28T23:59:00"))).toBe(260);
  });
});
