import { describe, expect, it } from "vitest";
import { buildProjection, projectSubject,
  attendanceTrend,
} from "@/lib/projections";
import type { AttendanceRecord, Mark, Subject, TimetableSlot } from "@/types";

const subj = (over: Partial<Subject>): Subject => ({
  id: over.id ?? "s1",
  device_id: "p",
  code: over.code ?? "X",
  name: over.name ?? "X",
  credits: over.credits ?? 4,
  type: "theory",
  faculty: null,
  color_hex: "#000",
  ...over,
});

describe("projectSubject", () => {
  it("derives remaining classes, scenarios and actions from the calendar", () => {
    // 5 Day-Order-1 dates; subject has one DO1 slot
    const effMap: Record<string, number> = {
      "2026-07-21": 1,
      "2026-07-28": 1,
      "2026-08-04": 1,
      "2026-08-11": 1,
      "2026-08-18": 1,
    };
    const slot: TimetableSlot = {
      id: "slot1",
      device_id: "p",
      subject_id: "s1",
      day_order: 1,
      start_time: "08:00:00",
      end_time: "08:50:00",
      room: null,
    };
    const recs: AttendanceRecord[] = [
      { id: "1", device_id: "p", subject_id: "s1", date: "2026-07-21", start_time: "08:00:00", end_time: "08:50:00", status: "present" },
      { id: "2", device_id: "p", subject_id: "s1", date: "2026-07-28", start_time: "08:00:00", end_time: "08:50:00", status: "present" },
      { id: "3", device_id: "p", subject_id: "s1", date: "2026-08-04", start_time: "08:00:00", end_time: "08:50:00", status: "absent" },
    ];
    // from 08-05: remaining = 08-11, 08-18 (2 unmarked future)
    const p = projectSubject(subj({ id: "s1" }), recs, [slot], effMap, "2026-08-05");
    expect(p.held).toBe(3);
    expect(p.attended).toBe(2);
    expect(p.remaining).toBe(2);
    expect(p.finalTotal).toBe(5);
    expect(p.bestPct).toBeCloseTo(80, 5); // (2+2)/5
    expect(p.worstPct).toBeCloseTo(40, 5); // 2/5
    expect(p.skipBudget).toBe(0); // floor(2+2 - 0.75*5) = 0
    expect(p.reachable).toBe(true); // best 80 >= 75
    expect(p.mustAttendStreak).toBe(1); // currently 66.7% -> ceil((0.75*3-2)/0.25)=1
    expect(p.recoveryDate).toBe("2026-08-11"); // 1st future class closes the gap
  });

  it("flags unreachable when even a perfect finish can't hit 75%", () => {
    const effMap = { "2026-08-11": 1 }; // only 1 future class
    const slot: TimetableSlot = {
      id: "s", device_id: "p", subject_id: "s1", day_order: 1,
      start_time: "08:00:00", end_time: "08:50:00", room: null,
    };
    // 1 present out of 9 held; +1 remaining -> best = 2/10 = 20%
    const recs: AttendanceRecord[] = Array.from({ length: 9 }, (_, i) => ({
      id: String(i), device_id: "p", subject_id: "s1",
      date: `2026-07-${String(i + 1).padStart(2, "0")}`,
      start_time: "07:00:00", end_time: "07:50:00",
      status: i === 0 ? "present" : "absent",
    }));
    const p = projectSubject(subj({ id: "s1" }), recs, [slot], effMap, "2026-08-01");
    expect(p.reachable).toBe(false);
    expect(p.riskLevel).toBe("critical");
    expect(p.recoveryDate).toBeNull(); // streak longer than remaining classes
  });
});

describe("buildProjection — grade budgets", () => {
  it("reads one CT as marks banked, not as a rate to hold", () => {
    const subject = subj({ id: "s1", credits: 4 });
    const marks: Mark[] = [
      { id: "m", device_id: "p", subject_id: "s1", component_type: "CT", label: "CT-1", marks_obtained: 12, max_marks: 15, is_external: false },
    ];
    const r = buildProjection([subject], [], [], marks, []);
    const g = r.gradeProjections[0];

    // 12 of 100 banked. The other 88 marks — 45 of unannounced
    // internals and the 40-mark end-sem — are still unplayed, which is
    // what the old rate model had no way to express.
    expect(g.banked).toBe(12);
    expect(g.pool).toBe(85);
    expect(g.internalWeight).toBe(60);

    expect(g.worstTotal).toBe(12); // score nothing from here
    expect(g.bestTotal).toBe(97); // ace everything from here
    expect(g.predictedTotal).toBeCloseTo(80, 5); // 80% pace extended over the pool
    expect(g.predictedGrade).toBe("A");

    // Default target comes from the target SGPA, not from the subject.
    expect(g.targetGrade).toBe("A+");
    expect(g.plan.needed).toBe(69); // 81 - 12
    expect(g.requiredRate).toBeCloseTo(69 / 85, 5);
    expect(g.nextGrade?.grade).toBe("A+");
  });

  it("solves a subject with no marks at all", () => {
    const r = buildProjection([subj({ id: "s1", credits: 4 })], [], [], [], []);
    const g = r.gradeProjections[0];
    expect(g.banked).toBe(0);
    expect(g.pool).toBe(100);
    expect(g.requiredRate).toBeCloseTo(0.81, 5);
    // Nothing banked is not a prediction of failure — it is excluded
    // from SGPA rather than dragging it to zero.
    expect(r.predictedSgpa).toBeNull();
  });

  it("honours a per-subject target over the target SGPA", () => {
    const subject = subj({ id: "s1", credits: 4, target_grade: "A" });
    const r = buildProjection([subject], [], [], [], [], undefined, undefined, 9);
    expect(r.gradeProjections[0].targetGrade).toBe("A");
    expect(r.gradeProjections[0].requiredRate).toBeCloseTo(0.71, 5);
  });
});

describe("attendanceTrend", () => {
  const day = (i: number) => `2026-09-${String(i).padStart(2, "0")}`;
  const runOf = (statuses: Array<"present" | "absent">): AttendanceRecord[] =>
    statuses.map((status, i) => ({ date: day(i + 1), status }) as AttendanceRecord);

  it("will not guess a direction from too little", () => {
    // Four points is a mood, not a trend.
    expect(attendanceTrend(runOf(["present", "absent", "present", "absent"]))).toBe("insufficient");
  });

  it("sees a slide", () => {
    // First half all present, second half all absent.
    expect(
      attendanceTrend(runOf(["present", "present", "present", "absent", "absent", "absent"]))
    ).toBe("declining");
  });

  it("sees a recovery", () => {
    expect(
      attendanceTrend(runOf(["absent", "absent", "absent", "present", "present", "present"]))
    ).toBe("improving");
  });

  it("calls an evenly spread record steady", () => {
    // One absence in each half: the rate is unchanged, so there is no
    // direction to report.
    expect(
      attendanceTrend(
        runOf(["present", "present", "absent", "present", "present", "absent"])
      )
    ).toBe("steady");
  });

  it("is sensitive at small sample sizes, by design", () => {
    // Eight records means halves of four, so a single absence moves the
    // rate 0.25 — far past the 0.08 band. That is not a bug: early in a
    // semester one miss genuinely is a quarter of your recent record.
    expect(
      attendanceTrend(
        runOf(["present", "present", "present", "present", "present", "present", "present", "absent"])
      )
    ).toBe("declining");
  });

  it("ignores cancelled classes when counting", () => {
    // "holiday" means no class was held; it is not a data point.
    const withHolidays = [
      ...runOf(["present", "present", "present", "absent", "absent", "absent"]),
      { date: day(7), status: "holiday" } as AttendanceRecord,
    ];
    expect(attendanceTrend(withHolidays)).toBe("declining");
  });

  it("does not depend on the caller sorting by date", () => {
    const shuffled = [...runOf(["present", "present", "present", "absent", "absent", "absent"])].reverse();
    expect(attendanceTrend(shuffled)).toBe("declining");
  });
});
