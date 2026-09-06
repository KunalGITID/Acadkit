import { describe, expect, it } from "vitest";
import { defaultEndTime, extraClassesFor } from "@/lib/extraClasses";
import type { AttendanceRecord, TimetableSlot } from "@/types";

const slot = (subject_id: string, start_time: string): TimetableSlot => ({
  id: `slot-${subject_id}-${start_time}`,
  device_id: "p",
  subject_id,
  day_order: 2,
  start_time,
  end_time: "08:50",
  room: null,
});

const rec = (subject_id: string, start_time: string, date = "2026-09-07"): AttendanceRecord => ({
  id: `r-${subject_id}-${start_time}`,
  device_id: "p",
  subject_id,
  date,
  start_time,
  end_time: "08:50",
  status: "present",
});

describe("extraClassesFor", () => {
  it("ignores classes the timetable schedules", () => {
    const out = extraClassesFor("2026-09-07", [rec("A", "08:00")], [slot("A", "08:00")], 2);
    expect(out).toEqual([]);
  });

  it("surfaces a class recorded outside the timetable", () => {
    const out = extraClassesFor("2026-09-07", [rec("A", "16:00")], [slot("A", "08:00")], 2);
    expect(out).toHaveLength(1);
    expect(out[0].subject_id).toBe("A");
    expect(out[0].start_time).toBe("16:00");
    expect(out[0].extra).toBe(true);
  });

  /**
   * Same subject, different hour: a makeup lecture for a class that
   * already met that day is the common case, so matching on subject
   * alone would hide it.
   */
  it("distinguishes a makeup from the scheduled sitting of the same subject", () => {
    const out = extraClassesFor(
      "2026-09-07",
      [rec("A", "08:00"), rec("A", "16:00")],
      [slot("A", "08:00")],
      2
    );
    expect(out.map((s) => s.start_time)).toEqual(["16:00"]);
  });

  it("only looks at the day in question", () => {
    const out = extraClassesFor(
      "2026-09-07",
      [rec("A", "16:00", "2026-09-08")],
      [slot("A", "08:00")],
      2
    );
    expect(out).toEqual([]);
  });

  it("sorts by time so the day reads in order", () => {
    const out = extraClassesFor(
      "2026-09-07",
      [rec("B", "17:00"), rec("A", "16:00")],
      [],
      2
    );
    expect(out.map((s) => s.start_time)).toEqual(["16:00", "17:00"]);
  });

  it("never reuses a real slot's id", () => {
    const out = extraClassesFor("2026-09-07", [rec("A", "16:00")], [], 2);
    expect(out[0].id.startsWith("extra:")).toBe(true);
  });
});

describe("defaultEndTime", () => {
  it("adds one period", () => {
    expect(defaultEndTime("08:00")).toBe("08:50");
    expect(defaultEndTime("14:30")).toBe("15:20");
  });

  it("carries the hour", () => {
    expect(defaultEndTime("09:20")).toBe("10:10");
  });

  it("leaves nonsense alone rather than inventing a time", () => {
    expect(defaultEndTime("oops")).toBe("oops");
  });
});
