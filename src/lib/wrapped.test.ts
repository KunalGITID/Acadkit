import { describe, expect, it } from "vitest";
import { buildWrapped, MINUTES_PER_CLASS } from "@/lib/wrapped";
import type { SubjectAttendance } from "@/lib/attendance";
import type { AttendanceRecord, Mark, Subject } from "@/types";

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

const mark = (subjectId: string, label: string, obtained: number, max: number): Mark =>
  ({ subject_id: subjectId, label, marks_obtained: obtained, max_marks: max }) as Mark;

const SUBJECTS = [
  { id: "OS", name: "Operating Systems", color_hex: "#f00" },
  { id: "DSA", name: "Data Structures", color_hex: "#00f" },
] as Subject[];

describe("marks in the recap", () => {
  it("has nothing to say before anything is graded", () => {
    const w = buildWrapped([subject("OS", 5, 5)], [], EFF, [], SUBJECTS);
    expect(w.bestResult).toBeNull();
    expect(w.marksTotal).toBeNull();
    expect(w.componentsGraded).toBe(0);
  });

  it("crowns the best percentage, not the biggest raw mark", () => {
    // 45/50 is the larger number; 19/20 is the better result.
    const w = buildWrapped(
      [subject("OS", 5, 5)],
      [],
      EFF,
      [mark("OS", "CT1", 45, 50), mark("DSA", "Quiz", 19, 20)],
      SUBJECTS
    );
    expect(w.bestResult?.label).toBe("Quiz");
    expect(w.bestResult?.subject).toBe("Data Structures");
    expect(w.bestResult?.percentage).toBe(95);
  });

  it("totals every graded component", () => {
    const w = buildWrapped(
      [subject("OS", 5, 5)],
      [],
      EFF,
      [mark("OS", "CT1", 45, 50), mark("DSA", "Quiz", 19, 20)],
      SUBJECTS
    );
    expect(w.marksTotal).toEqual({ obtained: 64, max: 70, percentage: (64 / 70) * 100 });
    expect(w.componentsGraded).toBe(2);
  });

  it("skips an ungraded row rather than scoring it zero", () => {
    // A row with no denominator is missing data. Counting it would drag
    // the total down and invent a result that was never sat.
    const w = buildWrapped(
      [subject("OS", 5, 5)],
      [],
      EFF,
      [mark("OS", "CT1", 45, 50), mark("OS", "Lab record", 0, 0)],
      SUBJECTS
    );
    expect(w.componentsGraded).toBe(1);
    expect(w.marksTotal).toEqual({ obtained: 45, max: 50, percentage: 90 });
  });

  it("survives a mark whose subject was deleted", () => {
    const w = buildWrapped([subject("OS", 5, 5)], [], EFF, [mark("gone", "CT1", 9, 10)], []);
    expect(w.bestResult?.subject).toBe("Unknown subject");
  });

  it("is not empty when marks exist but no class was ever marked", () => {
    const w = buildWrapped([subject("OS", 0, 0)], [], EFF, [mark("OS", "CT1", 9, 10)], SUBJECTS);
    expect(w.empty).toBe(false);
  });
});
