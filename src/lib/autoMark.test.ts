import { describe, expect, it } from "vitest";
import { describePending, pendingAutoMarks } from "@/lib/autoMark";
import type { AttendanceRecord, TimetableSlot } from "@/types";

function slot(
  subject_id: string,
  day_order: number,
  start_time: string
): TimetableSlot {
  return {
    id: `${subject_id}-${day_order}-${start_time}`,
    device_id: "1234",
    subject_id,
    day_order,
    start_time,
    end_time: "10:00:00",
    room: null,
  };
}

function record(
  subject_id: string,
  date: string,
  start_time: string,
  status: AttendanceRecord["status"] = "present"
): AttendanceRecord {
  return {
    id: `${subject_id}-${date}`,
    device_id: "1234",
    subject_id,
    date,
    start_time,
    end_time: "10:00:00",
    status,
  };
}

// Day orders 1 and 2 across four working days.
const EFF_MAP = {
  "2026-09-01": 1,
  "2026-09-02": 2,
  "2026-09-03": 1,
  "2026-09-04": 2,
};

const TIMETABLE = [slot("dsa", 1, "09:00:00"), slot("os", 2, "09:00:00")];

const START = "2026-09-01";

describe("pendingAutoMarks", () => {
  it("fills only past, unmarked classes", () => {
    const pending = pendingAutoMarks(TIMETABLE, EFF_MAP, [], "2026-09-03", START);
    expect(pending).toEqual([
      { subject_id: "dsa", date: "2026-09-01", start_time: "09:00:00", end_time: "10:00:00" },
      { subject_id: "os", date: "2026-09-02", start_time: "09:00:00", end_time: "10:00:00" },
    ]);
  });

  it("never marks today", () => {
    const pending = pendingAutoMarks(TIMETABLE, EFF_MAP, [], "2026-09-01", START);
    expect(pending).toEqual([]);
  });

  it("never marks the future", () => {
    const dates = pendingAutoMarks(TIMETABLE, EFF_MAP, [], "2026-09-04", START).map(
      (p) => p.date
    );
    expect(dates).not.toContain("2026-09-04");
  });

  it("leaves an existing absent alone", () => {
    const pending = pendingAutoMarks(
      TIMETABLE,
      EFF_MAP,
      [record("dsa", "2026-09-01", "09:00:00", "absent")],
      "2026-09-03",
      START
    );
    expect(pending.map((p) => p.subject_id)).toEqual(["os"]);
  });

  it("leaves a cancelled class alone", () => {
    const pending = pendingAutoMarks(
      TIMETABLE,
      EFF_MAP,
      [record("dsa", "2026-09-01", "09:00:00", "holiday")],
      "2026-09-03",
      START
    );
    expect(pending.map((p) => p.subject_id)).toEqual(["os"]);
  });

  it("skips dates missing from the effective map (declared holidays)", () => {
    const withHoliday = { ...EFF_MAP };
    delete (withHoliday as Record<string, number>)["2026-09-01"];
    const dates = pendingAutoMarks(TIMETABLE, withHoliday, [], "2026-09-03", START).map(
      (p) => p.date
    );
    expect(dates).toEqual(["2026-09-02"]);
  });

  it("ignores anything before the semester start", () => {
    const pending = pendingAutoMarks(TIMETABLE, EFF_MAP, [], "2026-09-03", "2026-09-02");
    expect(pending.map((p) => p.date)).toEqual(["2026-09-02"]);
  });

  it("handles two classes of the same subject on one day", () => {
    const two = [slot("dsa", 1, "09:00:00"), slot("dsa", 1, "11:00:00")];
    const pending = pendingAutoMarks(two, EFF_MAP, [], "2026-09-02", START);
    expect(pending.map((p) => p.start_time)).toEqual(["09:00:00", "11:00:00"]);
  });

  it("is idempotent — re-running after a write finds nothing", () => {
    const first = pendingAutoMarks(TIMETABLE, EFF_MAP, [], "2026-09-03", START);
    const written = first.map((p) => record(p.subject_id, p.date, p.start_time));
    expect(pendingAutoMarks(TIMETABLE, EFF_MAP, written, "2026-09-03", START)).toEqual([]);
  });
});

describe("describePending", () => {
  it("says nothing to do when empty", () => {
    expect(describePending([])).toMatch(/nothing to catch up/i);
  });

  it("counts classes and days", () => {
    const pending = pendingAutoMarks(TIMETABLE, EFF_MAP, [], "2026-09-03", START);
    expect(describePending(pending)).toBe("Mark 2 classes as present across 2 days.");
  });
});
