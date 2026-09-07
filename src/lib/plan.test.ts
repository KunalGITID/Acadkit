import { describe, expect, it } from "vitest";
import {
  assessmentFor,
  computeSgpa,
  subjectOutlook,
  ceilHalf,
  DEFAULT_INTERNAL_WEIGHT,
  editableAssessment,
  gradeForTargetSgpa,
  inferType,
  solveSubjectPlan,
} from "@/lib/plan";
import type { Assessment, Deadline, Grade, Mark, PlannedComponent, Subject } from "@/types";

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

describe("subjectOutlook — the number every screen outside Insights shows", () => {
  it("respects the split instead of ignoring it", () => {
    // Same marks, three different courses. The old model returned 80
    // for all three, because it never looked at the split.
    const marks = [mark("CT-1", 12, 15)];
    const at = (internal: number) =>
      subjectOutlook(subject({ internal, components: plan([["CT-1", 15]]) }), marks);

    expect(at(60).pool).toBe(85); // 45 internal + 40 end sem
    expect(at(100).pool).toBe(85); // all internal, none of it external
    expect(at(20).pool).toBeCloseTo(85, 6); // 5 internal + 80 end sem
    expect(at(15).internalWeight).toBe(15); // a 15/85 course is a course
  });

  it("counts a recorded end-sem, which the old model discarded", () => {
    // "Externals are intentionally ignored" was true and wrong: once the
    // paper is marked it is 40 of the 100, not a footnote.
    const s = subject({ internal: 60, components: plan([["CT-1", 60]]) });
    const withExt = subjectOutlook(s, [mark("CT-1", 30, 60), mark("End sem", 40, 40, true)]);
    expect(withExt.banked).toBe(70);
    expect(withExt.pool).toBe(0);
    expect(withExt.predictedTotal).toBe(70);
    expect(withExt.grade).toBe("B+");

    const withoutExt = subjectOutlook(s, [mark("CT-1", 30, 60)]);
    expect(withoutExt.pool).toBe(40);
    // Half of everything played, projected over the rest — nudged a
    // little toward the prior because 60 of 100 marks is good evidence
    // but not conclusive. See PRIOR_WEIGHT in plan.ts.
    expect(withoutExt.predictedTotal).toBeCloseTo(51.33, 2);
    expect(withoutExt.paceRate).toBe(0.5); // the raw observation is untouched
  });

  it("keeps the raw sums the Marks page prints", () => {
    const o = subjectOutlook(subject({ internal: 60, components: [] }), [
      mark("CT-1", 12, 15),
      mark("Assignment", 4, 5),
    ]);
    expect(o.internalObtained).toBe(16);
    expect(o.internalMax).toBe(20);
    expect(o.internalComponents).toHaveLength(2);
  });

  it("predicts the floor, not zero, before anything is graded", () => {
    const o = subjectOutlook(subject({ internal: 60, components: [] }), []);
    expect(o.hasAnyMarks).toBe(false);
    expect(o.predictedTotal).toBe(0);
    expect(o.pool).toBe(100);
  });
});

describe("computeSgpa on the budget model", () => {
  const s = (id: string, credits: number, internal = 60): Subject => ({
    ...subject({ internal, components: [] }),
    id,
    code: id,
    credits,
  });

  it("weights by credits and excludes audits and unmarked subjects", () => {
    const subjects = [s("a", 4), s("b", 4), s("z", 0), s("n", 3)];
    const map = new Map<string, Mark[]>([
      ["a", [mark("CT-1", 13, 15)]], // 86.7 → A+
      ["b", [mark("CT-1", 12, 15)]], // 80 → A
      ["z", [mark("CT-1", 15, 15)]], // audit, excluded from SGPA
    ]);
    const r = computeSgpa(subjects, map);
    expect(r.totalCredits).toBe(8);
    expect(r.countedSubjects).toBe(2);
    // Both land on an A. 13/15 is an A+ pace, but it is fifteen marks
    // of a hundred-mark course, and one strong component is not a
    // semester — the projection is tempered accordingly.
    expect(r.sgpa).toBeCloseTo(8, 5);
    // Raw sums still span every marked subject, audit included.
    expect(r.totalObtained).toBe(40);
    expect(r.totalMax).toBe(45);
  });

  it("trusts a nearly-finished subject more than a barely-started one", () => {
    // Identical raw rates, very different amounts of evidence. One
    // course is effectively over at half marks; the other has banked 10
    // of 100 and could still go anywhere, so its projection is pulled
    // further toward a neutral expectation. Reporting both as the same
    // grade — which is what an untempered rate does — treats a finished
    // subject and a rumour as the same kind of fact.
    const marks = new Map([["a", [mark("CT-1", 20, 40)]]]);
    const nearlyDone = computeSgpa(
      [{ ...s("a", 4), assessment: { internal: 100, complete: true, components: [{ key: "k", label: "CT-1", type: "CT", max: 40 }] } }],
      marks
    );
    const barelyStarted = computeSgpa(
      [{ ...s("a", 4), assessment: { internal: 20, complete: true, components: [{ key: "k", label: "CT-1", type: "CT", max: 40 }] } }],
      marks
    );

    const done = nearlyDone.rows[0].marks;
    const started = barelyStarted.rows[0].marks;

    expect(done.paceRate).toBeCloseTo(started.paceRate!, 9); // same observation
    expect(done.pool).toBe(0);
    expect(started.pool).toBe(80);

    // Nothing is left to move the finished one, so it reports what it is.
    expect(done.predictedTotal).toBe(50);
    // The other is pulled up toward the prior, because 10 banked marks
    // are not evidence of a 50% semester.
    expect(started.predictedTotal).toBeGreaterThan(50);
    expect(started.grade).not.toBe(done.grade);

    // What neither of them does is move the bracket.
    expect(done.banked).toBe(50);
    expect(started.banked).toBe(10);
    expect(done.ceiling).toBe(50);
    expect(started.ceiling).toBe(90);
  });

  it("returns null rather than 0 when nothing can be projected", () => {
    expect(computeSgpa([s("z", 0)], new Map()).sgpa).toBeNull();
    expect(computeSgpa([], new Map()).sgpa).toBeNull();
    expect(computeSgpa([s("a", 4)], new Map()).sgpa).toBeNull();
  });
});

describe("component dates, from the deadlines you already keep", () => {
  const dl = (title: string, due: string, max: number | null = null): Deadline => ({
    id: `d-${title}-${due}`,
    device_id: "0000",
    subject_id: "s1",
    title,
    type: "exam",
    due_date: `${due}T09:00:00.000Z`,
    status: "pending",
    priority: "medium",
    max_marks: max,
  });

  const planned = subject({
    internal: 60,
    components: plan([["CT-1", 15], ["CT-2", 15], ["Lab", 10]]),
  });

  it("dates a component from a deadline with the same name", () => {
    const p = solveSubjectPlan(planned, [], "A", { deadlines: [dl("CT-2", "2026-10-12")] });
    const ct2 = p.components.find((c) => c.label === "CT-2")!;
    expect(ct2.date).toBe("2026-10-12");
    expect(p.components.find((c) => c.label === "CT-1")!.date).toBeNull();
  });

  it("matches names loosely enough to be useful", () => {
    const p = solveSubjectPlan(planned, [], "A", { deadlines: [dl("ct 2", "2026-10-12")] });
    expect(p.components.find((c) => c.label === "CT-2")!.date).toBe("2026-10-12");
  });

  it("adopts a differently-named deadline instead of guessing at one", () => {
    // Same weight as the planned Lab, different name. Pairing them on
    // weight alone would lose this test from the budget and put a wrong
    // date on the Lab; adopting shows both, which you can merge by
    // renaming one.
    const p = solveSubjectPlan(planned, [], "A", {
      deadlines: [dl("Practical assessment", "2026-11-02", 10)],
    });
    expect(p.components.find((c) => c.label === "Lab")!.date).toBeNull();
    const adopted = p.components.find((c) => c.label === "Practical assessment")!;
    expect(adopted.kind).toBe("deadline");
    expect(adopted.date).toBe("2026-11-02");
  });

  it("never dates something already graded", () => {
    const p = solveSubjectPlan(planned, [mark("CT-1", 12, 15)], "A", { deadlines: [dl("CT-1", "2026-09-01")] });
    expect(p.components.find((c) => c.label === "CT-1")!.date).toBeNull();
  });

  it("names the soonest thing still to come", () => {
    const p = solveSubjectPlan(planned, [], "A", {
      deadlines: [dl("Lab", "2026-11-02"), dl("CT-2", "2026-10-12")],
    });
    expect(p.next?.label).toBe("CT-2");
    expect(p.next?.date).toBe("2026-10-12");
    expect(p.next?.required).toBeGreaterThan(0);
  });

  it("has no next when nothing is dated", () => {
    expect(solveSubjectPlan(planned, [], "A").next).toBeNull();
  });
});

describe("confidence band — how much your own results swing", () => {
  const four = subject({
    internal: 60,
    components: plan([["T1", 15], ["T2", 15], ["T3", 15], ["T4", 15]]),
  });

  it("says nothing from too few results", () => {
    expect(solveSubjectPlan(four, [mark("T1", 12, 15)], "A").band).toBeNull();
    expect(
      solveSubjectPlan(four, [mark("T1", 12, 15), mark("T2", 9, 15)], "A").band
    ).toBeNull();
  });

  it("collapses to a point when you are perfectly consistent", () => {
    const p = solveSubjectPlan(
      four,
      [mark("T1", 9, 15), mark("T2", 9, 15), mark("T3", 9, 15)],
      "A"
    );
    expect(p.band!.sd).toBeCloseTo(0, 9);
    expect(p.band!.low).toBeCloseTo(p.pace!, 9);
    expect(p.band!.high).toBeCloseTo(p.pace!, 9);
    expect(p.band!.samples).toBe(3);
  });

  it("widens when your results disagree with each other", () => {
    // Same average as above, wildly different consistency: 14/15 and
    // 2/15 average to the same place as three 8/15s and mean something
    // very different about the forecast.
    const steady = solveSubjectPlan(
      four,
      [mark("T1", 8, 15), mark("T2", 8, 15), mark("T3", 8, 15)],
      "A"
    );
    const swingy = solveSubjectPlan(
      four,
      [mark("T1", 14, 15), mark("T2", 2, 15), mark("T3", 8, 15)],
      "A"
    );
    expect(steady.pace).toBeCloseTo(swingy.pace!, 6); // identical pace
    expect(swingy.band!.sd).toBeGreaterThan(steady.band!.sd);
    expect(swingy.band!.high - swingy.band!.low).toBeGreaterThan(
      steady.band!.high - steady.band!.low
    );
  });

  it("stays inside the bracket it is drawn on", () => {
    const p = solveSubjectPlan(
      four,
      [mark("T1", 15, 15), mark("T2", 0, 15), mark("T3", 15, 15)],
      "A"
    );
    expect(p.band!.low).toBeGreaterThanOrEqual(p.floor - 1e-9);
    expect(p.band!.high).toBeLessThanOrEqual(p.ceiling + 1e-9);
    expect(p.band!.low).toBeLessThanOrEqual(p.band!.high);
  });

  it("has nothing to say once there is nothing left to forecast", () => {
    const done = subject({ internal: 100, components: plan([["T1", 40], ["T2", 30], ["T3", 30]]) });
    const p = solveSubjectPlan(
      done,
      [mark("T1", 30, 40), mark("T2", 20, 30), mark("T3", 25, 30)],
      "A"
    );
    expect(p.pool).toBe(0);
    expect(p.band).toBeNull();
  });
});

describe("a test logged in Deadlines is an announced component", () => {
  const dl = (title: string, due: string, max: number | null): Deadline => ({
    id: `d-${title}`,
    device_id: "0000",
    subject_id: "s1",
    title,
    type: "exam",
    due_date: `${due}T09:00:00.000Z`,
    status: "pending",
    priority: "medium",
    max_marks: max,
  });

  const partial = subject({ internal: 60, components: plan([["CT-1", 15]]) });

  it("adopts a marked deadline the plan has never heard of", () => {
    const p = solveSubjectPlan(partial, [], "A", { deadlines: [dl("Surprise quiz", "2026-10-20", 5)] });
    const quiz = p.components.find((c) => c.label === "Surprise quiz")!;
    expect(quiz.kind).toBe("deadline");
    expect(quiz.max).toBe(5);
    expect(quiz.date).toBe("2026-10-20");
    expect(quiz.required).toBeGreaterThan(0);
  });

  it("takes its weight out of the bucket, not on top of it", () => {
    const without = solveSubjectPlan(partial, [], "A");
    const with_ = solveSubjectPlan(partial, [], "A", { deadlines: [dl("Surprise quiz", "2026-10-20", 5)] });
    expect(without.components.find((c) => c.kind === "unannounced")!.max).toBe(45);
    expect(with_.components.find((c) => c.kind === "unannounced")!.max).toBe(40);
    // The course is still 100 marks either way.
    expect(with_.pool).toBe(without.pool);
  });

  it("stays one component when it is both planned and logged", () => {
    const p = solveSubjectPlan(partial, [], "A", { deadlines: [dl("CT-1", "2026-10-01", 15)] });
    expect(p.components.filter((c) => normalise(c.label) === "ct1")).toHaveLength(1);
    expect(p.components.find((c) => c.label === "CT-1")!.date).toBe("2026-10-01");
    expect(p.components.find((c) => c.label === "CT-1")!.kind).toBe("planned");
  });

  it("does not adopt the end-sem, which the split already models", () => {
    // Counting the paper as an internal component too would inflate the
    // internal side by the whole exam.
    const p = solveSubjectPlan(partial, [], "A", { deadlines: [dl("End sem", "2026-12-01", 40)] });
    expect(p.components.filter((c) => c.kind === "deadline")).toHaveLength(0);
    expect(p.internalWeight).toBe(60);
    // It still dates the end-sem row.
    expect(p.components.find((c) => c.kind === "external")!.date).toBe("2026-12-01");
  });

  it("does not adopt a test whose mark is already in", () => {
    const p = solveSubjectPlan(partial, [mark("Surprise quiz", 4, 5)], "A", {
      deadlines: [dl("Surprise quiz", "2026-10-20", 5)],
    });
    expect(p.components.filter((c) => c.kind === "deadline")).toHaveLength(0);
    expect(p.components.find((c) => c.label === "Surprise quiz")!.obtained).toBe(4);
  });

  it("ignores a deadline carrying no marks", () => {
    // A lab record with no denominator is a date, not a component.
    const p = solveSubjectPlan(partial, [], "A", { deadlines: [dl("Lab record", "2026-10-20", null)] });
    expect(p.components.some((c) => c.label === "Lab record")).toBe(false);
  });

  it("orders what's next across planned and adopted alike", () => {
    const p = solveSubjectPlan(partial, [], "A", {
      deadlines: [dl("CT-1", "2026-11-01", 15), dl("Surprise quiz", "2026-10-20", 5)],
    });
    expect(p.next?.label).toBe("Surprise quiz");
  });
});

/** Mirrors the engine's own label normalisation, for assertions. */
function normalise(s: string): string {
  return s.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

describe("assuming the end-sem, and solving the internals against it", () => {
  const full = subject({
    internal: 60,
    components: plan([["Assignment", 5], ["CT-1", 15], ["CT-2", 15], ["Lab", 10], ["Model", 15]]),
  });
  const solve = (marks: Mark[], pct: number | null, target: Grade = "A") =>
    solveSubjectPlan(full, marks, target, { assumedExternalPct: pct });

  it("hands the end-sem a fixed score and asks the internals for the rest", () => {
    // 85% of the 40-mark exam is 34. An A is 71, so the internals have
    // to find 37 of their 60 — 62%, not the 71% an even spread wants.
    const p = solve([], 85);
    expect(p.assumedExternal).toBeCloseTo(34, 6);
    expect(p.needed).toBeCloseTo(37, 6);
    expect(p.requiredRate).toBeCloseTo(37 / 60, 6);

    const ext = p.components.find((c) => c.kind === "external")!;
    expect(ext.assumed).toBeCloseTo(34, 6);
    expect(ext.required).toBeNull(); // it is assumed, not asked

    expect(needs(p)).toEqual({
      Assignment: 3.08,
      "CT-1": 9.25,
      "CT-2": 9.25,
      Lab: 6.17,
      Model: 9.25,
    });
  });

  it("asks more of the internals when you expect less of the exam", () => {
    const optimistic = solve([], 90);
    const pessimistic = solve([], 50);
    expect(pessimistic.requiredRate!).toBeGreaterThan(optimistic.requiredRate!);
    expect(solve([], null).requiredRate!).toBeGreaterThan(optimistic.requiredRate!);
  });

  it("leaves the bracket alone — an assumption cannot flatter the forecast", () => {
    const marks = [mark("Assignment", 5, 5), mark("CT-1", 2, 15)];
    const withAssumption = solve(marks, 90);
    const without = solve(marks, null);
    expect(withAssumption.banked).toBe(without.banked);
    expect(withAssumption.floor).toBe(without.floor);
    expect(withAssumption.ceiling).toBe(without.ceiling);
    expect(withAssumption.pace).toBe(without.pace);
    expect(withAssumption.paceRate).toBe(without.paceRate);
  });

  it("re-solves the internals as results land, same as ever", () => {
    const p = solve([mark("Assignment", 5, 5), mark("CT-1", 2, 15)], 85);
    // 7 banked + 34 assumed = 41. An A wants 30 more from the 40
    // internal marks left.
    expect(p.needed).toBeCloseTo(30, 6);
    expect(p.requiredRate).toBeCloseTo(0.75, 6);
    expect(needs(p)).toEqual({ "CT-2": 11.25, Lab: 7.5, Model: 11.25 });
  });

  it("prices every grade against the same assumption", () => {
    const p = solve([], 85);
    const row = (g: string) => p.perGrade.find((x) => x.grade === g)!;
    expect(row("C").needed).toBeCloseTo(16, 6); // 50 − 34
    expect(row("O").needed).toBeCloseTo(57, 6); // 91 − 34
    // 57 of the 60 internal marks is punishing but possible.
    expect(row("O").achievable).toBe(true);
    expect(row("O").rate).toBeCloseTo(57 / 60, 6);
  });

  it("drops the assumption once the real mark is in", () => {
    // An assumption about a paper that has been marked is worth nothing.
    const p = solve([mark("End sem", 20, 40, true)], 85);
    expect(p.assumedExternal).toBeNull();
    expect(p.components.find((c) => c.kind === "external")!.assumed).toBeNull();
    expect(p.banked).toBe(20);
  });

  it("has nothing to assume in a wholly internal subject", () => {
    const internalOnly = subject({ internal: 100, components: plan([["CT-1", 100]]) });
    const p = solveSubjectPlan(internalOnly, [], "A", { assumedExternalPct: 85 });
    expect(p.assumedExternal).toBeNull();
    expect(p.requiredRate).toBeCloseTo(0.71, 6);
  });

  it("clamps a nonsense assumption rather than propagating it", () => {
    expect(solve([], 400).assumedExternal).toBe(40);
    expect(solve([], -50).assumedExternal).toBe(0);
    expect(solve([], NaN).assumedExternal).toBeNull();
  });

  it("says out of reach when the internals alone cannot cover the rest", () => {
    // Expect little of the exam and an O stops being arithmetic.
    const p = solve([], 10, "O");
    expect(p.assumedExternal).toBeCloseTo(4, 6);
    expect(p.needed).toBeCloseTo(87, 6); // more than the 60 internals hold
    expect(p.status).toBe("out-of-reach");
  });
});


describe("what's next has to actually be next", () => {
  const dl = (title: string, due: string, max: number | null = 15): Deadline => ({
    id: `d-${title}`,
    device_id: "0000",
    subject_id: "s1",
    title,
    type: "exam",
    due_date: `${due}T09:00:00.000Z`,
    status: "pending",
    priority: "medium",
    max_marks: max,
  });
  const s = subject({ internal: 60, components: plan([["CT-1", 15], ["CT-2", 15]]) });
  const at = (today: string, deadlines: Deadline[]) =>
    solveSubjectPlan(s, [], "A", { deadlines, today });

  it("skips a date that has already gone by", () => {
    // The bug this exists for: a test sat on 3 Sep was announced as
    // "next up" on 7 Sep, because the list was sorted but never filtered.
    const p = at("2026-09-07", [dl("CT-1", "2026-09-03"), dl("CT-2", "2026-10-12")]);
    expect(p.next?.label).toBe("CT-2");
    expect(p.next?.date).toBe("2026-10-12");
  });

  it("has no next when everything dated is behind you", () => {
    expect(at("2026-09-07", [dl("CT-1", "2026-09-03")]).next).toBeNull();
  });

  it("counts today as still to come", () => {
    expect(at("2026-09-07", [dl("CT-1", "2026-09-07")]).next?.label).toBe("CT-1");
  });

  it("keeps an overdue test in the budget, flagged", () => {
    // It happened and it still owes marks; what it is not, is next.
    const p = at("2026-09-07", [dl("CT-1", "2026-09-03")]);
    const ct1 = p.components.find((c) => c.label === "CT-1")!;
    expect(ct1.overdue).toBe(true);
    expect(ct1.required).toBeGreaterThan(0);
    expect(p.components.find((c) => c.label === "CT-2")!.overdue).toBe(false);
  });

  it("does not call a graded component overdue", () => {
    const p = solveSubjectPlan(s, [mark("CT-1", 12, 15)], "A", {
      deadlines: [dl("CT-1", "2026-09-03")],
      today: "2026-09-07",
    });
    expect(p.components.find((c) => c.label === "CT-1")!.overdue).toBe(false);
  });
});

describe("a subject can expect something different of its own end-sem", () => {
  const s = (pct: number | null) =>
    subject({ internal: 60, components: plan([["CT-1", 60]]), assumedExternalPct: pct });

  it("overrides the semester-wide expectation", () => {
    const p = solveSubjectPlan(s(50), [], "A", { assumedExternalPct: 90 });
    expect(p.assumedExternal).toBe(20); // its own 50%, not the global 90%
  });

  it("falls back to the semester-wide one when it has no opinion", () => {
    const p = solveSubjectPlan(s(null), [], "A", { assumedExternalPct: 90 });
    expect(p.assumedExternal).toBe(36);
  });

  it("changes what the internals are asked for, and nothing else", () => {
    const easy = solveSubjectPlan(s(90), [], "A");
    const hard = solveSubjectPlan(s(40), [], "A");
    expect(easy.requiredRate!).toBeLessThan(hard.requiredRate!);
    expect(easy.ceiling).toBe(hard.ceiling);
    expect(easy.banked).toBe(hard.banked);
  });
});

describe("calibration — a projection has to earn its confidence", () => {
  const s = subject({ internal: 60, components: [] });

  it("does not call one perfect assignment an O", () => {
    // The complaint this exists for. 5 of 100 marks at full credit is
    // not a semester on course for a 10; it is one good morning.
    const p = subjectOutlook(s, [mark("Assignment", 5, 5)]);
    expect(p.paceRate).toBe(1); // the raw observation stands
    expect(p.pace).toBe(100); // and so does the untempered extension
    expect(p.predictedTotal).toBeLessThan(85); // but this is what's shown
    expect(p.grade).not.toBe("O");
  });

  it("softens one bad test without pretending it was fine", () => {
    // Worth being clear about the limit of this. 2/15 is 13%, and no
    // defensible prior turns that into a pass — reaching 50 from two
    // banked marks would need the prior to outweigh the evidence four
    // to one, which would make the projection useless once there *is*
    // evidence. So it still reads F, and it should. What tempering buys
    // is the difference between "13/100" and "35/100", and the card
    // carries a ceiling of 87 next to it saying the semester is not
    // over. An honest F beats a comforting B.
    const p = subjectOutlook(s, [mark("CT-1", 2, 15)]);
    expect(p.pace).toBeCloseTo(13.33, 2);
    expect(p.predictedTotal).toBeGreaterThan(30);
    expect(p.predictedTotal).toBeLessThan(50);
    expect(p.ceiling).toBe(87);
  });

  it("converges on the raw rate as marks accumulate", () => {
    // The prior is a stand-in for evidence you don't have yet. Once you
    // have the evidence it has to get out of the way.
    // Maxes stay inside the internal weight: a component bigger than
    // the weight is scaled to fit, which would make two of these
    // identical and the comparison meaningless.
    const gaps = [5, 15, 30, 45, 60].map((max) => {
      const o = subjectOutlook(s, [mark("CT-1", max * 0.8, max)]);
      return Math.abs(o.predictedTotal - o.pace!);
    });
    for (let i = 1; i < gaps.length; i++) {
      expect(gaps[i]).toBeLessThan(gaps[i - 1]);
    }
    expect(gaps.at(-1)!).toBeLessThan(1.5);
  });

  it("never touches what is actually banked or actually possible", () => {
    // Tempering is a statement about the unplayed marks. The floor and
    // the ceiling are facts and must survive it untouched.
    const p = subjectOutlook(s, [mark("Assignment", 5, 5)]);
    expect(p.banked).toBe(5);
    expect(p.ceiling).toBe(100);
    expect(p.predictedTotal).toBeGreaterThanOrEqual(p.banked);
    expect(p.predictedTotal).toBeLessThanOrEqual(p.ceiling);
  });

  it("has nothing to temper with nothing played", () => {
    const p = subjectOutlook(s, []);
    expect(p.predictedTotal).toBe(0);
    expect(p.projected).toBeNull();
  });

  it("stops mattering once the course is over", () => {
    const done = subject({ internal: 100, complete: true, components: plan([["CT-1", 100]]) });
    const p = subjectOutlook(done, [mark("CT-1", 62, 100)]);
    expect(p.pool).toBe(0);
    expect(p.predictedTotal).toBe(62); // no unplayed marks to be unsure about
  });
});

