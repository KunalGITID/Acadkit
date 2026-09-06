import { describe, expect, it } from "vitest";
import {
  assessmentFor,
  ceilHalf,
  DEFAULT_INTERNAL_WEIGHT,
  editableAssessment,
  gradeForTargetSgpa,
  inferType,
  solveSubjectPlan,
} from "@/lib/plan";
import type { Assessment, Mark, PlannedComponent, Subject } from "@/types";

const plan = (rows: Array<[string, number]>): PlannedComponent[] =>
  rows.map(([label, max]) => ({ key: label, label, type: "CT" as const, max }));

function subject(assessment?: Partial<Assessment>, extra: Partial<Subject> = {}): Subject {
  return {
    id: "s1",
    device_id: "0000",
    code: "21CSC101",
    name: "Data Structures",
    credits: 4,
    type: "theory",
    faculty: null,
    color_hex: "#888888",
    assessment: assessment
      ? { internal: 60, complete: false, components: [], ...assessment }
      : null,
    ...extra,
  };
}

let seq = 0;
function mark(label: string, obtained: number, max: number, isExternal = false): Mark {
  return {
    id: `m${seq++}`,
    device_id: "0000",
    subject_id: "s1",
    component_type: isExternal ? "External" : "CT",
    label,
    marks_obtained: obtained,
    max_marks: max,
    is_external: isExternal,
  };
}

/** Required marks keyed by component label, for terse assertions. */
function needs(p: ReturnType<typeof solveSubjectPlan>) {
  return Object.fromEntries(
    p.components
      .filter((c) => c.required !== null)
      .map((c) => [c.label, Number(c.required!.toFixed(2))])
  );
}

const FULL: PlannedComponent[] = plan([
  ["Assignment", 5],
  ["CT-1", 15],
  ["CT-2", 15],
  ["Lab", 10],
  ["Model", 15],
]);

describe("the scenario this engine exists for", () => {
  // 60/40 split, full plan, targeting A (71) in a subject you're weak in.
  const s = subject({ internal: 60, components: FULL });

  it("spreads the whole 100 before anything is graded", () => {
    const p = solveSubjectPlan(s, [], "A");
    expect(p.banked).toBe(0);
    expect(p.pool).toBe(100);
    expect(p.requiredRate).toBeCloseTo(0.71, 6);
    expect(needs(p)).toEqual({
      Assignment: 3.55,
      "CT-1": 10.65,
      "CT-2": 10.65,
      Lab: 7.1,
      Model: 10.65,
      "End semester": 28.4,
    });
  });

  it("re-solves over the remaining 55 + end-sem after a 5/5 assignment", () => {
    const p = solveSubjectPlan(s, [mark("Assignment", 5, 5)], "A");
    expect(p.banked).toBe(5);
    expect(p.remainingInternal).toBe(55);
    expect(p.pool).toBe(95);
    expect(p.needed).toBe(66);
    expect(p.requiredRate).toBeCloseTo(66 / 95, 6);
    expect(needs(p)).toEqual({
      "CT-1": 10.42,
      "CT-2": 10.42,
      Lab: 6.95,
      Model: 10.42,
      "End semester": 27.79,
    });
    // Nothing is graded except a perfect score, so pace flatters you —
    // the budget number is the one that moves.
    expect(p.status).toBe("on-track");
  });

  it("overhauls every remaining number after a 2/15 in the next test", () => {
    const p = solveSubjectPlan(s, [mark("Assignment", 5, 5), mark("CT-1", 2, 15)], "A");
    expect(p.banked).toBe(7);
    expect(p.remainingInternal).toBe(40);
    expect(p.pool).toBe(80);
    expect(p.needed).toBe(64);
    expect(p.requiredRate).toBeCloseTo(0.8, 6);
    expect(needs(p)).toEqual({
      "CT-2": 12,
      Lab: 8,
      Model: 12,
      "End semester": 32,
    });
    // 35% so far against 80% needed: the whole point of the card.
    expect(p.status).toBe("push");
    expect(p.paceRate).toBeCloseTo(0.35, 6);
  });

  it("keeps the target honest as the pool shrinks further", () => {
    const p = solveSubjectPlan(
      s,
      [mark("Assignment", 5, 5), mark("CT-1", 2, 15), mark("CT-2", 6, 15)],
      "A"
    );
    expect(p.banked).toBe(13);
    expect(p.pool).toBe(65);
    expect(p.requiredRate).toBeCloseTo(58 / 65, 6);
    expect(needs(p)).toEqual({ Lab: 8.92, Model: 13.38, "End semester": 35.69 });
  });
});

describe("status transitions", () => {
  const s = subject({ internal: 60, components: FULL });

  it("locks a target that zero on everything left still holds", () => {
    const p = solveSubjectPlan(
      s,
      [mark("Assignment", 5, 5), mark("CT-1", 15, 15), mark("CT-2", 15, 15), mark("Lab", 10, 10), mark("Model", 15, 15)],
      "C"
    );
    expect(p.banked).toBe(60);
    expect(p.status).toBe("locked");
    expect(p.needed).toBeLessThanOrEqual(0);
    expect(p.components.filter((c) => c.required !== null).every((c) => c.required === 0)).toBe(true);
  });

  it("calls a target out of reach once the arithmetic says so", () => {
    const p = solveSubjectPlan(
      s,
      [mark("Assignment", 0, 5), mark("CT-1", 0, 15), mark("CT-2", 0, 15), mark("Lab", 0, 10)],
      "A"
    );
    // 55 played for nothing; 55 left against a 71 threshold.
    expect(p.pool).toBe(55);
    expect(p.status).toBe("out-of-reach");
    expect(p.bestReachable).toBe("C");
    expect(p.slack).toBeNull();
  });

  it("reports final when there is nothing left to play for", () => {
    const p = solveSubjectPlan(
      s,
      [
        mark("Assignment", 4, 5), mark("CT-1", 12, 15), mark("CT-2", 12, 15),
        mark("Lab", 8, 10), mark("Model", 12, 15), mark("End sem", 30, 40, true),
      ],
      "A"
    );
    expect(p.pool).toBe(0);
    expect(p.status).toBe("final");
    expect(p.banked).toBeCloseTo(78, 6);
    expect(p.floorGrade).toBe("A");
    expect(p.requiredRate).toBeNull();
  });

  it("reports slack when the ceiling clears the target", () => {
    const p = solveSubjectPlan(s, [mark("Assignment", 5, 5)], "B");
    expect(p.slack).toBeCloseTo(100 - 56, 6);
  });
});

describe("partial and absent plans", () => {
  it("keeps undeclared internal weight as one open bucket", () => {
    // Only the assignment has been announced; 55 internal marks are real
    // but unspecified, which is the normal state for half a semester.
    const s = subject({ internal: 60, components: plan([["Assignment", 5]]) });
    const p = solveSubjectPlan(s, [mark("Assignment", 5, 5)], "A");
    const bucket = p.components.find((c) => c.kind === "unannounced")!;
    expect(bucket.max).toBe(55);
    expect(bucket.required).toBeCloseTo((66 / 95) * 55, 6);
    expect(p.pool).toBe(95);
  });

  it("solves with no plan at all, in one lump", () => {
    const s = subject({ internal: 60, components: [] });
    const p = solveSubjectPlan(s, [mark("Assignment", 5, 5)], "A");
    expect(p.components.map((c) => c.kind)).toEqual(["extra", "unannounced", "external"]);
    expect(p.components.find((c) => c.kind === "unannounced")!.max).toBe(55);
    expect(p.pool).toBe(95);
  });

  it("shrinks the bucket as a test gets announced", () => {
    const before = solveSubjectPlan(subject({ components: plan([["Assignment", 5]]) }), [], "A");
    const after = solveSubjectPlan(
      subject({ components: plan([["Assignment", 5], ["CT-1", 15]]) }),
      [],
      "A"
    );
    expect(before.components.find((c) => c.kind === "unannounced")!.max).toBe(55);
    expect(after.components.find((c) => c.kind === "unannounced")!.max).toBe(40);
    // Declaring a test moves no marks — the pool is the same 100.
    expect(before.pool).toBe(after.pool);
  });

  it("counts a graded component nobody declared", () => {
    const s = subject({ internal: 60, components: plan([["CT-1", 15]]) });
    const p = solveSubjectPlan(s, [mark("Surprise quiz", 4, 5)], "A");
    const extra = p.components.find((c) => c.kind === "extra")!;
    expect(extra.max).toBe(5);
    expect(extra.obtained).toBe(4);
    expect(p.components.find((c) => c.kind === "unannounced")!.max).toBe(40);
  });
});

describe("splits other than 60/40", () => {
  it("handles a wholly internal subject", () => {
    const s = subject({ internal: 100, components: plan([["Lab 1", 40], ["Lab 2", 60]]) });
    const p = solveSubjectPlan(s, [mark("Lab 1", 30, 40)], "A+");
    expect(p.externalWeight).toBe(0);
    expect(p.components.some((c) => c.kind === "external")).toBe(false);
    expect(p.pool).toBe(60);
    expect(p.needed).toBe(51);
    expect(needs(p)).toEqual({ "Lab 2": 51 });
  });

  it("handles a wholly external subject", () => {
    const s = subject({ internal: 0, components: [] });
    const p = solveSubjectPlan(s, [], "A");
    expect(p.components).toHaveLength(1);
    expect(p.components[0].kind).toBe("external");
    expect(p.components[0].required).toBe(71);
  });

  it("handles a 70/30 split", () => {
    const s = subject({ internal: 70, components: plan([["CT-1", 35], ["CT-2", 35]]) });
    const p = solveSubjectPlan(s, [mark("CT-1", 28, 35)], "A");
    expect(p.pool).toBe(65);
    expect(p.needed).toBe(43);
    expect(needs(p)).toEqual({ "CT-2": 23.15, "End semester": 19.85 });
  });

  it("falls back to internal_only, then to 60/40", () => {
    expect(assessmentFor(subject(undefined, { internal_only: true })).internal).toBe(100);
    expect(assessmentFor(subject()).internal).toBe(DEFAULT_INTERNAL_WEIGHT);
  });
});

describe("units that don't sum to the weight", () => {
  it("scales an overflowing plan onto the internal weight", () => {
    // Portal-shaped: components described out of 100 on a 60-weight subject.
    const s = subject({ internal: 60, components: plan([["CT-1", 50], ["CT-2", 50]]) });
    const p = solveSubjectPlan(s, [mark("CT-1", 25, 50)], "A");
    expect(p.scaled).toBe(true);
    expect(p.banked).toBeCloseTo(15, 6); // half of a 30-mark component
    expect(p.components.find((c) => c.label === "CT-2")!.max).toBeCloseTo(30, 6);
    expect(p.components.some((c) => c.kind === "unannounced")).toBe(false);
  });

  it("scales a plan marked complete up to the weight", () => {
    const s = subject({ internal: 60, complete: true, components: plan([["CT-1", 10], ["CT-2", 10]]) });
    const p = solveSubjectPlan(s, [mark("CT-1", 5, 10)], "A");
    expect(p.scaled).toBe(true);
    expect(p.banked).toBeCloseTo(15, 6);
    expect(p.components.some((c) => c.kind === "unannounced")).toBe(false);
    expect(p.pool).toBeCloseTo(70, 6);
  });

  it("respects a declared weight over what the mark was out of", () => {
    // Plan says CT-1 is worth 15 of the internal 60; the portal recorded
    // it out of 50. The ratio is what carries over.
    const s = subject({ internal: 60, components: plan([["CT-1", 15]]) });
    const p = solveSubjectPlan(s, [mark("CT-1", 40, 50)], "A");
    expect(p.banked).toBeCloseTo(12, 6);
  });

  it("matches labels regardless of case and spacing", () => {
    const s = subject({ internal: 60, components: plan([["CT-1", 15]]) });
    const p = solveSubjectPlan(s, [mark("ct 1", 12, 15)], "A");
    expect(p.banked).toBe(12);
    expect(p.components.some((c) => c.kind === "extra")).toBe(false);
  });
});

describe("per-grade table and helpers", () => {
  it("marks every grade secured, reachable or gone", () => {
    const s = subject({ internal: 60, components: FULL });
    const p = solveSubjectPlan(s, [mark("Assignment", 5, 5), mark("CT-1", 2, 15)], "A");
    const row = (g: string) => p.perGrade.find((x) => x.grade === g)!;
    expect(row("C").achievable).toBe(true);
    expect(row("O").needed).toBe(84);
    expect(row("O").achievable).toBe(false); // 84 needed, only 80 left
    // 74 of the remaining 80 — brutal, but not yet arithmetically gone,
    // and the card should say so rather than write the grade off.
    expect(row("A+").achievable).toBe(true);
    expect(row("A+").rate).toBeCloseTo(74 / 80, 6);
    expect(p.bestReachable).toBe("A+");
    expect(p.perGrade.every((g) => !g.secured)).toBe(true);
  });

  it("derives a default target grade from a target SGPA", () => {
    expect(gradeForTargetSgpa(9)).toBe("A+");
    expect(gradeForTargetSgpa(8.5)).toBe("A+");
    expect(gradeForTargetSgpa(8)).toBe("A");
    expect(gradeForTargetSgpa(10)).toBe("O");
    expect(gradeForTargetSgpa(5)).toBe("C");
  });

  it("rounds required marks up to the next half", () => {
    expect(ceilHalf(10.42)).toBe(10.5);
    expect(ceilHalf(12)).toBe(12);
    expect(ceilHalf(6.95)).toBe(7);
    expect(ceilHalf(0)).toBe(0);
  });
});

describe("plan-editor helpers", () => {
  it("reads a component's type off its label so the sheet needs no control", () => {
    expect(inferType("CT-1")).toBe("CT");
    expect(inferType("Lab eval 2")).toBe("Lab");
    expect(inferType("practical record")).toBe("Lab");
    expect(inferType("Assignment 3")).toBe("Assignment");
    expect(inferType("Mini project")).toBe("Project");
    expect(inferType("Surprise quiz")).toBe("CT");
  });

  it("opens the editor on the common split, or on the old flag", () => {
    expect(editableAssessment(null, false).internal).toBe(DEFAULT_INTERNAL_WEIGHT);
    expect(editableAssessment(undefined, true).internal).toBe(100);
    expect(editableAssessment(null, false).components).toEqual([]);
  });

  it("keeps a half-typed row that assessmentFor would discard", () => {
    const draft: Assessment = {
      internal: 60,
      complete: false,
      components: [{ key: "k", label: "", type: "CT", max: 0 }],
    };
    expect(editableAssessment(draft, false).components).toHaveLength(1);
    expect(assessmentFor(subject(draft)).components).toHaveLength(0);
  });
});
