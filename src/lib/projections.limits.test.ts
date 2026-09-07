/**
 * The multi-subject layer under sweep.
 *
 * plan.limits.test.ts hardens one subject's budget. This does the same
 * for what sits on top of it: the SGPA bracket, the per-subject target
 * derived from a target SGPA, and `planForSgpa`. The load-bearing claim
 * up here is that these three can't disagree with each other or with
 * the cards, so most of what follows checks exactly that.
 */
import { describe, expect, it } from "vitest";
import { buildProjection } from "@/lib/projections";
import { computeSgpa } from "@/lib/plan";
import { groupMarksBySubject } from "@/lib/grades";
import { gradeForTargetSgpa } from "@/lib/plan";
import { GRADE_TABLE, type Grade } from "@/lib/grades";
import type { Assessment, Mark, Subject } from "@/types";

let seq = 0;
function subj(credits: number, assessment: Assessment | null, extra: Partial<Subject> = {}): Subject {
  const id = `s${seq++}`;
  return {
    id,
    device_id: "0000",
    code: `SUB${id}`,
    name: `Subject ${id}`,
    credits,
    type: "theory",
    faculty: null,
    color_hex: "#888",
    assessment,
    ...extra,
  };
}

function mk(subjectId: string, label: string, obtained: number, max: number, isExternal = false): Mark {
  return {
    id: `m${seq++}`,
    device_id: "0000",
    subject_id: subjectId,
    component_type: isExternal ? "External" : "CT",
    label,
    marks_obtained: obtained,
    max_marks: max,
    is_external: isExternal,
  };
}

const split = (internal: number): Assessment => ({
  internal,
  complete: false,
  components: [
    { key: "a", label: "Assignment", type: "Assignment", max: Math.round(internal * 0.1) },
    { key: "c1", label: "CT-1", type: "CT", max: Math.round(internal * 0.25) },
    { key: "c2", label: "CT-2", type: "CT", max: Math.round(internal * 0.25) },
  ],
});

/** A realistic semester: six subjects, mixed splits, mixed progress. */
function semester() {
  const subjects = [
    subj(4, split(60)),
    subj(4, split(50)),
    subj(3, split(100)), // internal-only
    subj(3, split(40)),
    subj(2, split(60)),
    subj(0, split(60)), // audit — never counts toward SGPA
  ];
  const marks: Mark[] = [
    mk(subjects[0].id, "Assignment", 6, 6),
    mk(subjects[0].id, "CT-1", 2, 15),
    mk(subjects[1].id, "Assignment", 4, 5),
    mk(subjects[2].id, "CT-1", 20, 25),
    mk(subjects[3].id, "CT-1", 5, 10),
    mk(subjects[3].id, "End sem", 40, 60, true),
    mk(subjects[4].id, "Assignment", 0, 6),
    mk(subjects[5].id, "CT-1", 9, 15),
  ];
  return { subjects, marks };
}

const report = (targetSgpa: number) => {
  const { subjects, marks } = semester();
  return buildProjection(subjects, [], [], marks, [], undefined, undefined, targetSgpa);
};

describe("the SGPA bracket holds for every target", () => {
  it("stays ordered and in range across the whole 0–10 scale", () => {
    for (let t = 0; t <= 10.0001; t += 0.25) {
      const r = report(t);
      const where = `target ${t.toFixed(2)}`;
      for (const v of [r.floorSgpa, r.predictedSgpa, r.ceilingSgpa]) {
        expect(v, where).not.toBeNull();
        expect(Number.isFinite(v!), where).toBe(true);
        expect(v!, where).toBeGreaterThanOrEqual(0);
        expect(v!, where).toBeLessThanOrEqual(10);
      }
      expect(r.floorSgpa!, where).toBeLessThanOrEqual(r.predictedSgpa! + 1e-9);
      expect(r.predictedSgpa!, where).toBeLessThanOrEqual(r.ceilingSgpa! + 1e-9);
    }
  });

  it("keeps the forecast independent of what you're aiming at", () => {
    // Changing the target changes what's *required*, never what's
    // banked or predicted. A page where aiming higher improved the
    // forecast would be telling you what you want to hear.
    const base = report(6);
    for (const t of [0, 5, 7.5, 8.5, 9, 10]) {
      const r = report(t);
      expect(r.predictedSgpa).toBeCloseTo(base.predictedSgpa!, 9);
      expect(r.floorSgpa).toBeCloseTo(base.floorSgpa!, 9);
      expect(r.ceilingSgpa).toBeCloseTo(base.ceilingSgpa!, 9);
      r.gradeProjections.forEach((p, i) => {
        expect(p.banked).toBeCloseTo(base.gradeProjections[i].banked, 9);
        expect(p.pool).toBeCloseTo(base.gradeProjections[i].pool, 9);
      });
    }
  });

  it("moves the requirement, and only the requirement", () => {
    const low = report(5).gradeProjections[0];
    const high = report(10).gradeProjections[0];
    expect(high.targetGrade).toBe("O");
    expect(low.targetGrade).toBe("C");
    expect(high.requiredRate!).toBeGreaterThan(low.requiredRate!);
  });

  it("excludes 0-credit subjects from the SGPA but still solves them", () => {
    const r = report(8.5);
    const audit = r.gradeProjections.find((p) => p.subject.credits === 0)!;
    expect(audit.plan.pool).toBeGreaterThan(0); // it still gets a card
    const credited = r.gradeProjections.filter((p) => p.subject.credits > 0 && p.plan.hasAnyMarks);
    const cr = credited.reduce((s, p) => s + p.subject.credits, 0);
    const expected = credited.reduce((s, p) => s + p.predictedPoints * p.subject.credits, 0) / cr;
    expect(r.predictedSgpa!).toBeCloseTo(expected, 9);
  });
});

describe("target grade derivation", () => {
  it("gives every subject the grade the target SGPA implies", () => {
    for (let t = 0; t <= 10.0001; t += 0.5) {
      const expected = gradeForTargetSgpa(t);
      for (const p of report(t).gradeProjections) {
        expect(p.targetGrade, `target ${t}`).toBe(expected);
      }
    }
  });

  it("lets a per-subject target override it in both directions", () => {
    const { subjects, marks } = semester();
    const tweaked = subjects.map((s, i) =>
      i === 0 ? { ...s, target_grade: "C" as Grade } : i === 1 ? { ...s, target_grade: "O" as Grade } : s
    );
    const r = buildProjection(tweaked, [], [], marks, [], undefined, undefined, 8.5);
    expect(r.gradeProjections[0].targetGrade).toBe("C");
    expect(r.gradeProjections[1].targetGrade).toBe("O");
    expect(r.gradeProjections[2].targetGrade).toBe("A+"); // still follows 8.5
  });

  it("never derives a target the grade table can't award", () => {
    for (let t = -5; t <= 15; t += 0.1) {
      const g = gradeForTargetSgpa(t);
      expect(GRADE_TABLE.map((r) => r.grade)).toContain(g);
      expect(g).not.toBe("F");
    }
  });
});

describe("degenerate semesters", () => {
  it("survives no subjects", () => {
    const r = buildProjection([], [], [], [], []);
    expect(r.gradeProjections).toEqual([]);
    expect(r.predictedSgpa).toBeNull();
    expect(computeSgpa([], new Map()).sgpa).toBeNull();
  });

  it("survives subjects with no marks anywhere", () => {
    const { subjects } = semester();
    const r = buildProjection(subjects, [], [], [], [], undefined, undefined, 9);
    expect(r.gradeProjections).toHaveLength(subjects.length);
    expect(r.predictedSgpa).toBeNull();
    for (const p of r.gradeProjections) {
      expect(p.banked).toBe(0);
      expect(p.pool).toBe(100);
      expect(p.targetGrade).toBe("A+");
    }
  });

  it("survives a semester of nothing but 0-credit subjects", () => {
    const r = buildProjection([subj(0, split(60))], [], [], [], []);
    expect(r.predictedSgpa).toBeNull();
    expect(computeSgpa(r.gradeProjections.map((p) => p.subject), new Map()).sgpa).toBeNull();
  });

  it("handles a fully finished semester", () => {
    const s = subj(4, { internal: 60, complete: false, components: [{ key: "c", label: "CT-1", type: "CT", max: 60 }] });
    const r = buildProjection(
      [s], [], [],
      [mk(s.id, "CT-1", 48, 60), mk(s.id, "End sem", 30, 40, true)],
      []
    );
    const p = r.gradeProjections[0];
    expect(p.plan.status).toBe("final");
    expect(p.banked).toBeCloseTo(78, 6);
    expect(p.predictedTotal).toBeCloseTo(78, 6);
    expect(r.predictedSgpa).toBe(8); // A
    expect(r.floorSgpa).toBe(8);
    expect(r.ceilingSgpa).toBe(8); // nothing left to change it
  });
});

describe("the Dashboard and Insights cannot disagree", () => {
  /**
   * The bug this suite exists to prevent.
   *
   * Dashboard, Marks, History and Wrapped read `computeSgpa`; Insights
   * reads `buildProjection`. Until the app moved onto one model those
   * were different pieces of arithmetic over the same marks, so the
   * dial on the home screen and the hero on Insights could — and did —
   * disagree about the same semester. Both now derive from
   * `subjectOutlook`, and these are the assertions that keep it that way.
   */
  it("reports the same SGPA from both entry points, for every target", () => {
    for (let t = 0; t <= 10.0001; t += 0.5) {
      const { subjects, marks } = semester();
      const insights = buildProjection(subjects, [], [], marks, [], undefined, undefined, t);
      const dashboard = computeSgpa(subjects, groupMarksBySubject(marks));
      expect(dashboard.sgpa, `target ${t}`).toBeCloseTo(insights.predictedSgpa!, 9);
      expect(dashboard.countedSubjects).toBe(
        insights.gradeProjections.filter((p) => p.subject.credits > 0 && p.plan.hasAnyMarks).length
      );
    }
  });

  it("agrees per subject, not just in the average", () => {
    const { subjects, marks } = semester();
    const insights = buildProjection(subjects, [], [], marks, []);
    const dashboard = computeSgpa(subjects, groupMarksBySubject(marks));
    for (const row of dashboard.rows) {
      const card = insights.gradeProjections.find((p) => p.subject.id === row.subject.id)!;
      expect(row.marks.predictedTotal, row.subject.id).toBeCloseTo(card.predictedTotal, 9);
      expect(row.marks.grade, row.subject.id).toBe(card.predictedGrade);
      expect(row.marks.banked, row.subject.id).toBeCloseTo(card.banked, 9);
      expect(row.marks.pool, row.subject.id).toBeCloseTo(card.pool, 9);
    }
  });

  it("keeps agreeing when the splits are anything but 60/40", () => {
    // The case that prompted the port: a semester where no two subjects
    // are weighted alike.
    const odd = [
      subj(4, split(100)),
      subj(4, split(75)),
      subj(3, split(50)),
      subj(3, split(25)),
      subj(2, split(0)),
    ];
    const marks = odd.flatMap((s) => [mk(s.id, "CT-1", 7, 10)]);
    const insights = buildProjection(odd, [], [], marks, []);
    const dashboard = computeSgpa(odd, groupMarksBySubject(marks));
    expect(dashboard.sgpa).toBeCloseTo(insights.predictedSgpa!, 9);
    // And every one of them is solved on its own weight.
    expect(insights.gradeProjections.map((p) => p.internalWeight)).toEqual([100, 75, 50, 25, 0]);
  });
});

describe("attendance decides whether the grade plan is even possible", () => {
  /**
   * Below the minimum you are not permitted into the end-sem, so a plan
   * whose whole pool is that exam is not a pessimistic forecast — it is
   * fiction. These two halves of the projection never spoke to each
   * other before; this is the join.
   */
  const WINDOW = { start: "2026-09-01", end: "2026-11-30" };
  const FROM = "2026-09-15";

  const slots = [1, 2, 3, 4, 5].map((day_order) => ({
    id: `slot${day_order}`,
    device_id: "0000",
    subject_id: "att",
    day_order,
    start_time: "08:00:00",
    end_time: "08:50:00",
    room: null,
  }));

  const att = (i: number, status: "present" | "absent") => ({
    id: `a${i}`,
    device_id: "0000",
    subject_id: "att",
    date: `2026-09-0${i}`,
    start_time: "08:00:00",
    end_time: "08:50:00",
    status,
  });

  const subject = (): Subject => ({ ...subj(4, split(60)), id: "att" });

  const run = (
    records: ReturnType<typeof att>[],
    timetable: typeof slots,
    marks: Mark[] = []
  ) =>
    buildProjection(
      [subject()],
      records,
      timetable,
      marks,
      [],
      FROM,
      WINDOW,
      8.5
    ).gradeProjections[0];

  it("says nothing when there is nothing to go on", () => {
    const p = run([], []);
    expect(p.eligibility.status).toBe("unknown");
    expect(p.eligibility.pct).toBeNull();
  });

  it("stays quiet when you're above the line", () => {
    const p = run([att(1, "present"), att(2, "present"), att(3, "present")], slots);
    expect(p.eligibility.status).toBe("safe");
    expect(p.eligibility.pct).toBe(100);
  });

  it("warns while 75% is still recoverable", () => {
    // 1 of 4, with a term's worth of classes left to climb back through.
    const p = run(
      [att(1, "present"), att(2, "absent"), att(3, "absent"), att(4, "absent")],
      slots
    );
    expect(p.eligibility.status).toBe("at-risk");
    expect(p.eligibility.pct).toBe(25);
    expect(p.eligibility.needToAttend).toBe(8); // (0.75·4 − 1) / 0.25
    expect(p.eligibility.clearBy).not.toBeNull();
    expect(p.riskLevel).not.toBe("safe");
  });

  it("calls it barred once the arithmetic is gone", () => {
    // Same record, but no classes remain to recover in.
    const p = run(
      [att(1, "present"), att(2, "absent"), att(3, "absent"), att(4, "absent")],
      []
    );
    expect(p.eligibility.status).toBe("barred");
    expect(p.eligibility.bestPct).toBe(25);
    // It outranks everything else the card could say about this subject.
    expect(p.riskLevel).toBe("critical");
  });

  it("leaves the marks budget untouched — the two are orthogonal", () => {
    // Attendance decides whether the plan is worth anything; it does not
    // change the arithmetic of the plan itself.
    const marks = [mk("att", "CT-1", 12, 15)];
    const barred = run([att(1, "absent"), att(2, "absent")], [], marks);
    const safe = run([att(1, "present"), att(2, "present")], [], marks);
    expect(barred.eligibility.status).toBe("barred");
    expect(safe.eligibility.status).toBe("safe");
    expect(barred.banked).toBe(safe.banked);
    expect(barred.pool).toBe(safe.pool);
    expect(barred.requiredRate).toBe(safe.requiredRate);
  });
});
