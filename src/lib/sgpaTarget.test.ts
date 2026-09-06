import { describe, expect, it } from "vitest";
import { planForSgpa } from "@/lib/sgpaTarget";
import type { SubjectGradeProjection } from "@/lib/projections";
import type { Grade, Subject } from "@/types";

const subject = (id: string, credits: number): Subject => ({
  id,
  device_id: "p",
  code: id,
  name: id,
  credits,
  type: "theory",
  faculty: null,
  color_hex: "#000",
});

/** A projection stub carrying only what planForSgpa reads. */
function proj(
  id: string,
  credits: number,
  predictedPoints: number,
  next: { points: number; rate: number } | null,
  bestGrade: Grade = "O",
  paceRate: number | null = 0.5
): SubjectGradeProjection {
  return {
    subject: subject(id, credits),
    predictedPoints,
    predictedGrade: "B+",
    bestGrade,
    paceRate,
    pool: 100,
    nextGrade: next ? { grade: "A" as const, points: next.points, rate: next.rate } : null,
    riskLevel: "safe",
  } as SubjectGradeProjection;
}

describe("planForSgpa", () => {
  it("says nothing to do when already on pace", () => {
    const plan = planForSgpa([proj("A", 4, 9, null)], 8.5);
    expect(plan.status).toBe("met");
    expect(plan.lifts).toEqual([]);
  });

  it("has no answer with no credit-bearing subjects", () => {
    expect(planForSgpa([proj("A", 0, 9, null)], 8.5).status).toBe("unknown");
  });

  it("weights the projection by credits", () => {
    // 9 over 4 credits and 7 over 2 is 8.33, not 8.
    const plan = planForSgpa([proj("A", 4, 9, null), proj("B", 2, 7, null)], 9.5);
    expect(plan.projected).toBeCloseTo(8.3333, 3);
  });

  it("reports out of reach when even every ceiling falls short", () => {
    // Ceiling is O = 10 everywhere, so 10.5 can never happen.
    const plan = planForSgpa([proj("A", 4, 8, { points: 9, rate: 0.6 })], 10.5);
    expect(plan.status).toBe("out-of-reach");
    expect(plan.lifts).toEqual([]);
  });

  it("picks the lift that is closest to already being true", () => {
    // Both gain the same; A needs 5 points of rate above pace, B needs 30.
    const a = proj("A", 4, 8, { points: 9, rate: 0.55 }, "O", 0.5);
    const b = proj("B", 4, 8, { points: 9, rate: 0.8 }, "O", 0.5);
    const plan = planForSgpa([b, a], 8.6);
    expect(plan.status).toBe("reachable");
    expect(plan.lifts[0].subject.id).toBe("A");
    expect(plan.lifts[0].extraRate).toBeCloseTo(0.05);
  });

  it("stops as soon as the target is covered", () => {
    const rows = [
      proj("A", 4, 8, { points: 9, rate: 0.51 }, "O", 0.5),
      proj("B", 4, 8, { points: 9, rate: 0.52 }, "O", 0.5),
      proj("C", 4, 8, { points: 9, rate: 0.53 }, "O", 0.5),
    ];
    const plan = planForSgpa(rows, 8.4);
    // One lift moves 12 credits' worth by 1 point → +0.333.
    expect(plan.lifts).toHaveLength(2);
    expect(plan.projectedAfter!).toBeGreaterThanOrEqual(8.4);
  });

  /**
   * The ceiling can allow a target that single-grade steps can't reach.
   * Claiming "reachable" while listing a plan that falls short would be
   * worse than admitting it.
   */
  it("admits when one grade each isn't enough", () => {
    const plan = planForSgpa(
      [proj("A", 4, 6, { points: 7, rate: 0.6 }, "O", 0.5)],
      9.5
    );
    expect(plan.status).toBe("needs-more-than-one-grade");
    expect(plan.projectedAfter!).toBeLessThan(9.5);
  });

  it("never suggests a lift that loses ground", () => {
    const plan = planForSgpa([proj("A", 4, 9, { points: 8, rate: 0.1 })], 9.5);
    expect(plan.lifts.every((l) => l.gain > 0)).toBe(true);
  });
});
