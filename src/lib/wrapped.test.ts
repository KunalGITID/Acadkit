import { describe, expect, it } from "vitest";
import { buildWrapped, MINUTES_PER_CLASS } from "@/lib/wrapped";
import type { SubjectAttendance } from "@/lib/attendance";
import type { AttendanceRecord, Subject } from "@/types";

const subject = (
  name: string,
  attended: number,
  total: number,
  color = "#fff"
): SubjectAttendance =>
  ({
    subject: { id: name, name, color_hex: color } as Subject,
    attended,
    total,
    percentage: total ? (attended / total) * 100 : null,
    canBunk: 0,
    needToAttend: 0,
    source: "manual",
  }) as SubjectAttendance;

const rec = (date: string, status: AttendanceRecord["status"]): AttendanceRecord =>
  ({ date, status, start_time: `0${Math.random()}` }) as AttendanceRecord;

const EFF = {
  "2026-09-01": 1,
  "2026-09-02": 2,
  "2026-09-03": 3,
  "2026-09-04": 4,
  "2026-09-05": 5,
};

describe("buildWrapped", () => {
  it("is empty when nothing has been recorded", () => {
    const w = buildWrapped([subject("OS", 0, 0)], [], EFF);
    expect(w.empty).toBe(true);
    expect(w.hours).toBe(0);
  });

  it("totals attended and missed across subjects", () => {
    const w = buildWrapped([subject("OS", 20, 24), subject("DSA", 40, 44)], [], EFF);
    expect(w.attended).toBe(60);
    expect(w.missed).toBe(8);
  });

  it("turns classes into hours, rounding down", () => {
    // 5 classes × 50 min = 250 min = 4.17 h. Claiming 5 would be a lie
    // in the flattering direction, which is the one to avoid.
    const w = buildWrapped([subject("OS", 5, 5)], [], EFF);
    expect(w.hours).toBe(Math.floor((5 * MINUTES_PER_CLASS) / 60));
    expect(w.hours).toBe(4);
  });

  it("names the best and worst subject", () => {
    const w = buildWrapped(
      [subject("OS", 20, 40), subject("DSA", 40, 40), subject("Maths", 30, 40)],
      [],
      EFF
    );
    expect(w.best?.name).toBe("DSA");
    expect(w.worst?.name).toBe("OS");
  });

  it("refuses a best/worst comparison with only one subject", () => {
    // They would be the same row printed twice.
    const w = buildWrapped([subject("OS", 20, 40)], [], EFF);
    expect(w.best).toBeNull();
    expect(w.worst).toBeNull();
  });

  it("ignores subjects with nothing marked when ranking", () => {
    const w = buildWrapped([subject("OS", 20, 40), subject("DSA", 40, 40), subject("New", 0, 0)], [], EFF);
    expect(w.worst?.name).toBe("OS");
  });

  describe("clean streak", () => {
    it("counts consecutive marked days with no absence", () => {
      const w = buildWrapped(
        [subject("OS", 4, 5)],
        [
          rec("2026-09-01", "present"),
          rec("2026-09-02", "present"),
          rec("2026-09-03", "present"),
          rec("2026-09-04", "absent"),
          rec("2026-09-05", "present"),
        ],
        EFF
      );
      expect(w.cleanStreak).toBe(3);
    });

    it("breaks a day that mixes present and absent", () => {
      const w = buildWrapped(
        [subject("OS", 2, 3)],
        [
          rec("2026-09-01", "present"),
          rec("2026-09-02", "present"),
          rec("2026-09-02", "absent"),
        ],
        EFF
      );
      expect(w.cleanStreak).toBe(1);
    });

    it("does not break a streak on a day you simply never marked", () => {
      // Missing data is not a bad day; punishing it would punish you for
      // not opening the app.
      const w = buildWrapped(
        [subject("OS", 2, 2)],
        [rec("2026-09-01", "present"), rec("2026-09-05", "present")],
        EFF
      );
      expect(w.cleanStreak).toBe(2);
    });

    it("ignores cancelled classes", () => {
      const w = buildWrapped(
        [subject("OS", 1, 1)],
        [rec("2026-09-01", "present"), rec("2026-09-02", "holiday")],
        EFF
      );
      expect(w.cleanStreak).toBe(1);
      expect(w.daysMarked).toBe(1);
    });
  });

  describe("worst day order", () => {
    it("finds the day order absorbing the most absences", () => {
      const w = buildWrapped(
        [subject("OS", 1, 4)],
        [
          rec("2026-09-01", "absent"),
          rec("2026-09-03", "absent"),
          rec("2026-09-03", "absent"),
          rec("2026-09-02", "present"),
        ],
        EFF
      );
      expect(w.worstDayOrder).toEqual({ dayOrder: 3, missed: 2 });
    });

    it("is null when you have never missed a class", () => {
      const w = buildWrapped([subject("OS", 2, 2)], [rec("2026-09-01", "present")], EFF);
      expect(w.worstDayOrder).toBeNull();
    });

    it("breaks ties toward the lower day order, so the answer is stable", () => {
      const w = buildWrapped(
        [subject("OS", 0, 2)],
        [rec("2026-09-03", "absent"), rec("2026-09-01", "absent")],
        EFF
      );
      expect(w.worstDayOrder).toEqual({ dayOrder: 1, missed: 1 });
    });

    it("skips a record on a date outside the semester map", () => {
      const w = buildWrapped([subject("OS", 0, 1)], [rec("2025-01-01", "absent")], EFF);
      expect(w.worstDayOrder).toBeNull();
    });
  });
});
