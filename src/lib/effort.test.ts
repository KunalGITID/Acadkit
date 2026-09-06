import { describe, expect, it } from "vitest";
import { allocateEffort } from "@/lib/effort";
import { buildProjection } from "@/lib/projections";
import type { Assessment, Mark, Subject } from "@/types";

let seq = 0;
function subj(credits: number, internal = 60, target?: Subject["target_grade"]): Subject {
  const id = `s${seq++}`;
  const assessment: Assessment = { internal, complete: false, components: [] };
  return {
    id,
    device_id: "0000",
    code: id,
    name: `Subject ${id}`,
    credits,
    type: "theory",
    faculty: null,
    color_hex: "#888",
    assessment,
    target_grade: target ?? null,
  };
}

const mk = (subjectId: string, obtained: number, max: number): Mark => ({
  id: `m${seq++}`,
  device_id: "0000",
  subject_id: subjectId,
  component_type: "CT",
  label: "CT-1",
  marks_obtained: obtained,
  max_marks: max,
  is_external: false,
});

const report = (subjects: Subject[], marks: Mark[]) =>
  buildProjection(subjects, [], [], marks, []).gradeProjections;

describe("allocateEffort", () => {
  it("says nothing to do when the pace already meets the target", () => {
    const a = subj(4);
    const plan = allocateEffort(report([a], [mk(a.id, 19, 20)]), 8);
    expect(plan.status).toBe("met");
    expect(plan.moves).toEqual([]);
    expect(plan.totalCost).toBe(0);
  });

  it("has no answer without credit-bearing subjects", () => {
    const z = subj(0);
    expect(allocateEffort(report([z], [mk(z.id, 10, 20)]), 8).status).toBe("unknown");
    expect(allocateEffort([], 8).status).toBe("unknown");
  });

  it("reports out of reach only when every ceiling together falls short", () => {
    const a = subj(4);
    // 2/20 banked with 80 left tops out at 82 — an A+, never an O.
    const plan = allocateEffort(report([a], [mk(a.id, 2, 20)]), 10);
    expect(plan.status).toBe("out-of-reach");
    expect(plan.ceiling!).toBeLessThan(10);
    expect(plan.moves).toEqual([]);
  });

  it("buys the cheapest SGPA first", () => {
    // Same credits, same size of lift in grade points, different
    // distances: one subject is two marks below A+, the other six below
    // an A. The near one is the better buy and must be picked first.
    const near = subj(4);
    const far = subj(4);
    const rows = report(
      [far, near],
      [mk(near.id, 39.5, 50), mk(far.id, 32.5, 50)] // paces of 79 and 65
    );
    expect(rows.find((r) => r.subject.id === near.id)!.predictedTotal).toBeCloseTo(79, 6);
    expect(rows.find((r) => r.subject.id === far.id)!.predictedTotal).toBeCloseTo(65, 6);

    const plan = allocateEffort(rows, 8.3);
    expect(plan.status).toBe("reachable");
    expect(plan.moves[0].subject.id).toBe(near.id);
    expect(plan.moves[0].cost).toBeCloseTo(2, 6); // 81 - 79
  });

  it("prices a lift as the distance from your pace to the threshold", () => {
    // The cost model, asserted rather than described. Note what is
    // absent from it: the size of the pool. How many more marks a grade
    // costs does not depend on how many chances remain — that decides
    // whether it is reachable, and at what rate, not what it costs.
    const a = subj(4);
    const rows = report([a], [mk(a.id, 12, 20)]); // pace 60, a B
    const plan = allocateEffort(rows, 9);
    for (const m of plan.moves) {
      const row = rows[0].plan.perGrade.find((g) => g.grade === m.to)!;
      expect(m.cost).toBeCloseTo(row.minTotal - rows[0].predictedTotal, 6);
    }
    expect(plan.moves[0].cost).toBeCloseTo(1, 6); // B+ starts one mark up
  });

  it("charges for every lift, because a grade above your pace is not free", () => {
    // A grade you are already on pace for is your grade; anything above
    // it is by definition further than you are currently heading. There
    // is no such thing as a free lift and the ranking must not invent one.
    const subjects = [subj(4), subj(3), subj(2)];
    const marks = [
      mk(subjects[0].id, 3, 20),
      mk(subjects[1].id, 14, 20),
      mk(subjects[2].id, 17, 20),
    ];
    const rows = report(subjects, marks);
    for (let t = 0; t <= 10.0001; t += 0.5) {
      for (const m of allocateEffort(rows, t).moves) {
        expect(m.cost, `${m.from}→${m.to}`).toBeGreaterThan(0);
        expect(Number.isFinite(m.efficiency)).toBe(true);
      }
    }
  });

  it("climbs one subject twice when that is what the target needs", () => {
    // The case planForSgpa could only describe, never plan: one subject,
    // two grades. It allowed a single step each and then admitted defeat.
    const only = subj(4, 60);
    const plan = allocateEffort(report([only], [mk(only.id, 12, 20)]), 9);
    expect(plan.status).toBe("reachable");
    expect(plan.moves.length).toBeGreaterThan(1);
    expect(plan.moves.every((m) => m.subject.id === only.id)).toBe(true);
    // Each move starts where the last one finished.
    for (let i = 1; i < plan.moves.length; i++) {
      expect(plan.moves[i].from).toBe(plan.moves[i - 1].to);
    }
  });

  it("stops as soon as the target is covered", () => {
    const subjects = [subj(4), subj(4), subj(4)];
    const marks = subjects.map((s) => mk(s.id, 12, 20));
    const plan = allocateEffort(report(subjects, marks), 8.4);
    expect(plan.projectedAfter!).toBeGreaterThanOrEqual(8.4 - 1e-9);
    // Dropping the last move must leave it short, or it did too much.
    const withoutLast = plan.moves
      .slice(0, -1)
      .reduce((s, m) => s + m.gain, plan.projected!);
    expect(withoutLast).toBeLessThan(8.4);
  });

  it("never proposes a grade the subject cannot still reach", () => {
    const subjects = [subj(4), subj(3), subj(2)];
    const marks = [mk(subjects[0].id, 3, 20), mk(subjects[1].id, 14, 20), mk(subjects[2].id, 9, 20)];
    const rows = report(subjects, marks);
    for (let t = 0; t <= 10.0001; t += 0.25) {
      const plan = allocateEffort(rows, t);
      for (const m of plan.moves) {
        const p = rows.find((x) => x.subject.id === m.subject.id)!;
        const row = p.plan.perGrade.find((g) => g.grade === m.to)!;
        expect(row.achievable, `target ${t} → ${m.to}`).toBe(true);
        expect(m.gain).toBeGreaterThan(0);
        expect(m.cost).toBeGreaterThanOrEqual(0);
      }
      expect(plan.totalCost).toBeCloseTo(
        plan.moves.reduce((s, m) => s + m.cost, 0),
        9
      );
      if (plan.status === "reachable") {
        expect(plan.projectedAfter!).toBeGreaterThanOrEqual(t - 1e-9);
      }
    }
  });

});
