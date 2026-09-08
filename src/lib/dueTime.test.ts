import { describe, expect, it } from "vitest";
import { describeDueTime, suggestDueTime } from "@/lib/dueTime";
import type { SubjectType, TimetableSlot } from "@/types";

const DSA = "dsa";
const OS = "os";

const slot = (
  subjectId: string,
  start: string,
  end: string,
  type: SubjectType = "theory",
  dayOrder = 3
): TimetableSlot =>
  ({
    id: `${subjectId}-${start}`,
    subject_id: subjectId,
    day_order: dayOrder,
    start_time: `${start}:00`,
    end_time: `${end}:00`,
    slot_type: type,
  }) as TimetableSlot;

/** Day Order 3: DSA theory at 8, a DSA double lab at 10, OS at 12. */
const DAY_3 = [
  slot(DSA, "08:00", "08:50"),
  slot(OS, "12:00", "12:50"),
  slot(DSA, "10:00", "10:50", "lab"),
  slot(DSA, "10:50", "11:40", "lab"),
];

describe("suggestDueTime", () => {
  it("puts a lab at the start of that day's lab period", () => {
    expect(suggestDueTime("lab", DSA, 3, DAY_3)).toEqual({ time: "10:00", anchor: "lab" });
  });

  it("falls back to 8:00 for a lab on a day the subject has only theory", () => {
    const theoryOnly = [slot(DSA, "09:00", "09:50")];
    expect(suggestDueTime("lab", DSA, 3, theoryOnly)).toEqual({ time: "08:00", anchor: "none" });
  });

  it("puts an exam at the start of a double period", () => {
    expect(suggestDueTime("exam", DSA, 3, DAY_3)).toEqual({ time: "10:00", anchor: "double" });
  });

  it("treats rounded period times as one double period", () => {
    // 09:00–09:50 then 10:00–10:50 is the same sitting written less exactly.
    const rounded = [slot(DSA, "09:00", "09:50"), slot(DSA, "10:00", "10:50")];
    expect(suggestDueTime("exam", DSA, 3, rounded)).toEqual({ time: "09:00", anchor: "double" });
  });

  it("settles an exam on a single period when the day has no double", () => {
    const single = [slot(DSA, "08:00", "08:50"), slot(DSA, "14:00", "14:50")];
    expect(suggestDueTime("exam", DSA, 3, single)).toEqual({ time: "08:00", anchor: "period" });
  });

  it("puts an assignment in the first period of the day", () => {
    expect(suggestDueTime("assignment", DSA, 3, DAY_3)).toEqual({
      time: "08:00",
      anchor: "period",
    });
  });

  it("ignores other subjects' periods", () => {
    expect(suggestDueTime("assignment", DSA, 3, [slot(OS, "09:00", "09:50")])).toEqual({
      time: "08:00",
      anchor: "none",
    });
  });

  it("ignores the same subject on another day order", () => {
    expect(suggestDueTime("assignment", DSA, 4, DAY_3)).toEqual({
      time: "08:00",
      anchor: "none",
    });
  });

  it("falls back to 8:00 on a day with no day order at all", () => {
    expect(suggestDueTime("exam", DSA, null, DAY_3)).toEqual({ time: "08:00", anchor: "none" });
  });

  it("says nothing for a type that names no kind of period", () => {
    expect(suggestDueTime("other", DSA, 3, DAY_3)).toBeNull();
  });

  it("says nothing until a subject is picked", () => {
    expect(suggestDueTime("lab", null, 3, DAY_3)).toBeNull();
  });
});

describe("describeDueTime", () => {
  it("names where each time came from", () => {
    expect(describeDueTime({ time: "10:00", anchor: "lab" })).toMatch(/lab period/);
    expect(describeDueTime({ time: "10:00", anchor: "double" })).toMatch(/double period/);
    expect(describeDueTime({ time: "08:00", anchor: "period" })).toMatch(/class/);
    expect(describeDueTime({ time: "08:00", anchor: "none" })).toMatch(/No class/);
  });
});
