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
import { planForSgpa } from "@/lib/sgpaTarget";
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

describe("planForSgpa cannot disagree with the cards", () => {
  it("reports the same projection the report does", () => {
    for (let t = 0; t <= 10.0001; t += 0.5) {
      const r = report(t);
      const plan = planForSgpa(r.gradeProjections, t);
      if (plan.status === "unknown") continue;
      // The doc claims nothing is re-derived. This is that claim.
      const credited = r.gradeProjections.filter((p) => p.subject.credits > 0);
      const cr = credited.reduce((s, p) => s + p.subject.credits, 0);
      const projected =
        credited.reduce((s, p) => s + p.predictedPoints * p.subject.credits, 0) / cr;
      expect(plan.projected!, `target ${t}`).toBeCloseTo(projected, 9);
    }
  });

  it("only ever proposes lifts that gain ground and stay reachable", () => {
    for (let t = 0; t <= 10.0001; t += 0.25) {
      const r = report(t);
      const plan = planForSgpa(r.gradeProjections, t);
      for (const lift of plan.lifts) {
        expect(lift.gain, `target ${t}`).toBeGreaterThan(0);
        expect(lift.requiredRate).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(lift.neededMarks)).toBe(true);
        // A lift is a grade the subject can actually still reach.
        const p = r.gradeProjections.find((x) => x.subject.id === lift.subject.id)!;
        const row = p.plan.perGrade.find((g) => g.grade === lift.to)!;
        expect(row.achievable, `${lift.subject.id} → ${lift.to}`).toBe(true);
      }
      if (plan.status === "reachable") {
        expect(plan.projectedAfter!).toBeGreaterThanOrEqual(t - 1e-9);
      }
      if (plan.status === "needs-more-than-one-grade") {
        expect(plan.projectedAfter!).toBeLessThan(t);
      }
    }
  });

  it("says out of reach only when the ceiling really is short", () => {
    for (let t = 0; t <= 10.0001; t += 0.25) {
      const r = report(t);
      const plan = planForSgpa(r.gradeProjections, t);
      if (plan.status === "out-of-reach") expect(plan.ceiling!).toBeLessThan(t);
      if (plan.status === "met") expect(plan.projected!).toBeGreaterThanOrEqual(t - 1e-9);
    }
  });
});

describe("degenerate semesters", () => {
  it("survives no subjects", () => {
    const r = buildProjection([], [], [], [], []);
    expect(r.gradeProjections).toEqual([]);
    expect(r.predictedSgpa).toBeNull();
    expect(planForSgpa([], 8.5).status).toBe("unknown");
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
    expect(planForSgpa(r.gradeProjections, 8.5).status).toBe("unknown");
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
