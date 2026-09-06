/**
 * The engine under adversarial conditions.
 *
 * plan.test.ts reads as documentation — the canonical scenario, one
 * assertion per line. This file is the opposite: it sweeps the whole
 * input space looking for a combination that breaks an invariant, and
 * pins the edges that real data actually produces (a portal row worth
 * more than it should be, a plan that overflows, a subject whose
 * internals are finished and only the end-sem is left).
 *
 * The invariants are the contract. If one of them fails the number on
 * someone's Insights card is wrong, whatever the scenario tests say.
 */
import { describe, expect, it } from "vitest";
import { GRADE_TABLE, gradeForTotal, type Grade } from "@/lib/grades";
import {
  ceilHalf,
  floorHalf,
  floorTotal,
  gradeForTargetSgpa,
  solveSubjectPlan,
  type SubjectPlan,
} from "@/lib/plan";
import type { Assessment, Mark, PlannedComponent, Subject } from "@/types";

const GRADES: Grade[] = ["O", "A+", "A", "B+", "B", "C"];
const thresholdOf = (g: Grade) => GRADE_TABLE.find((r) => r.grade === g)!.min;

let seq = 0;
function subj(assessment: Assessment | null, extra: Partial<Subject> = {}): Subject {
  return {
    id: `s${seq++}`,
    device_id: "0000",
    code: "SUB101",
    name: "Subject",
    credits: 4,
    type: "theory",
    faculty: null,
    color_hex: "#888",
    assessment,
    ...extra,
  };
}

function mk(label: string, obtained: number, max: number, isExternal = false): Mark {
  return {
    id: `m${seq++}`,
    device_id: "0000",
    subject_id: "s",
    component_type: isExternal ? "External" : "CT",
    label,
    marks_obtained: obtained,
    max_marks: max,
    is_external: isExternal,
  };
}

const comps = (rows: Array<[string, number]>): PlannedComponent[] =>
  rows.map(([label, max]) => ({ key: label, label, type: "CT" as const, max }));

/**
 * Everything that must hold for every input, ever.
 *
 * Checked after each solve in the sweep below, so a violation names the
 * exact configuration that produced it rather than a failing total
 * three screens later.
 */
function assertInvariants(p: SubjectPlan, where: string) {
  const finite = (n: number | null, what: string) => {
    if (n !== null && !Number.isFinite(n)) {
      throw new Error(`${where}: ${what} is not finite (${n})`);
    }
  };

  finite(p.banked, "banked");
  finite(p.pool, "pool");
  finite(p.floor, "floor");
  finite(p.ceiling, "ceiling");
  finite(p.pace, "pace");
  finite(p.requiredRate, "requiredRate");
  finite(p.paceRate, "paceRate");
  finite(p.needed, "needed");
  finite(p.slack, "slack");
  finite(p.internalWeight, "internalWeight");

  // The course is 100 marks. Every one of them is in exactly one
  // component, played or not.
  const total = p.components.reduce((s, c) => s + c.max, 0);
  expect(total, `${where}: components must cover /100`).toBeCloseTo(100, 6);
  expect(p.internalWeight + p.externalWeight, `${where}: weights`).toBeCloseTo(100, 6);

  // Banked is what's played; pool is what isn't. Together, the course.
  const playedMax = p.components
    .filter((c) => c.obtained !== null)
    .reduce((s, c) => s + c.max, 0);
  expect(playedMax + p.pool, `${where}: played + pool`).toBeCloseTo(100, 6);

  expect(p.pool, `${where}: pool >= 0`).toBeGreaterThanOrEqual(-1e-9);
  expect(p.floor).toBe(p.banked);
  expect(p.ceiling).toBeCloseTo(p.banked + p.pool, 6);
  expect(p.ceiling, `${where}: ceiling >= floor`).toBeGreaterThanOrEqual(p.floor - 1e-9);

  // Status is a function of the budget, and must agree with it.
  const t = p.target.minTotal;
  if (p.pool <= 1e-9) expect(p.status, where).toBe("final");
  else if (p.banked >= t - 1e-9) expect(p.status, where).toBe("locked");
  else if (p.banked + p.pool < t - 1e-9) expect(p.status, where).toBe("out-of-reach");
  else expect(["on-track", "push"], where).toContain(p.status);

  // Every grade row agrees with the same budget.
  for (const g of p.perGrade) {
    expect(g.needed, `${where}: ${g.grade} needed`).toBeCloseTo(g.minTotal - p.banked, 6);
    expect(g.secured, `${where}: ${g.grade} secured`).toBe(g.needed <= 1e-9);
    expect(g.achievable, `${where}: ${g.grade} achievable`).toBe(g.needed <= p.pool + 1e-9);
  }
  // Harder grades are never easier to reach.
  for (let i = 1; i < p.perGrade.length; i++) {
    expect(p.perGrade[i].needed).toBeLessThanOrEqual(p.perGrade[i - 1].needed + 1e-9);
  }
  // bestReachable is exactly the best achievable row.
  expect(p.bestReachable).toBe(p.perGrade.find((g) => g.achievable)?.grade ?? null);

  // Required marks never exceed what a component is worth, unless the
  // target is genuinely gone — in which case the card says so.
  for (const c of p.components) {
    if (c.required === null) continue;
    expect(c.required, `${where}: ${c.label} required >= 0`).toBeGreaterThanOrEqual(-1e-9);
    if (p.status !== "out-of-reach") {
      expect(c.required, `${where}: ${c.label} required <= max`).toBeLessThanOrEqual(c.max + 1e-9);
    }
  }

  // THE round trip: score exactly what's asked on everything left and
  // you land exactly on the threshold. This is the whole promise.
  if (p.status === "push" || p.status === "on-track") {
    const asked = p.components.reduce((s, c) => s + (c.required ?? 0), 0);
    expect(p.banked + asked, `${where}: round trip`).toBeCloseTo(t, 6);
  }
}

describe("invariants hold across the whole input space", () => {
  const WEIGHTS = [0, 1, 25, 33, 40, 50, 60, 70, 75, 99, 100];
  const PLANS: Array<[string, (w: number) => PlannedComponent[]]> = [
    ["no plan", () => []],
    ["partial", () => comps([["Assignment", 5]])],
    ["full 60", () => comps([["Assignment", 5], ["CT-1", 15], ["CT-2", 15], ["Lab", 10], ["Model", 15]])],
    ["overflowing", () => comps([["CT-1", 50], ["CT-2", 50], ["CT-3", 50]])],
    ["single", (w) => comps([["Only", Math.max(1, w)]])],
  ];
  const MARKSETS: Array<[string, Mark[]]> = [
    ["none", []],
    ["one perfect", [mk("Assignment", 5, 5)]],
    ["one zero", [mk("Assignment", 0, 5)]],
    ["a bad CT", [mk("Assignment", 5, 5), mk("CT-1", 2, 15)]],
    ["all internals", [mk("Assignment", 4, 5), mk("CT-1", 11, 15), mk("CT-2", 12, 15), mk("Lab", 9, 10), mk("Model", 13, 15)]],
    ["internals + external", [mk("Assignment", 4, 5), mk("CT-1", 11, 15), mk("CT-2", 12, 15), mk("Lab", 9, 10), mk("Model", 13, 15), mk("End sem", 30, 40, true)]],
    ["external only", [mk("End sem", 22, 40, true)]],
    ["undeclared extra", [mk("Pop quiz", 3, 4)]],
  ];

  it("survives every weight × plan × marks × target combination", () => {
    let checked = 0;
    for (const w of WEIGHTS) {
      for (const [planName, planOf] of PLANS) {
        for (const complete of [false, true]) {
          for (const [markName, marks] of MARKSETS) {
            for (const target of GRADES) {
              const assessment: Assessment = { internal: w, complete, components: planOf(w) };
              const where = `w=${w} ${planName}${complete ? "+complete" : ""} / ${markName} / →${target}`;
              assertInvariants(solveSubjectPlan(subj(assessment), marks, target), where);
              checked++;
            }
          }
        }
      }
    }
    // Guards the sweep itself: a silently empty loop proves nothing.
    expect(checked).toBe(
      WEIGHTS.length * PLANS.length * 2 * MARKSETS.length * GRADES.length
    );
  });

  it("holds with no assessment at all, on every target", () => {
    for (const target of GRADES) {
      for (const marks of MARKSETS) {
        assertInvariants(solveSubjectPlan(subj(null), marks[1], target), `bare/${marks[0]}/${target}`);
        assertInvariants(
          solveSubjectPlan(subj(null, { internal_only: true }), marks[1], target),
          `internal_only/${marks[0]}/${target}`
        );
      }
    }
  });
});

describe("internals finished — what the end-sem has to return", () => {
  // The question every SRM student actually asks in the last week: the
  // 60 is settled, only the 40 is left, what does each grade cost.
  const full = comps([["Assignment", 5], ["CT-1", 15], ["CT-2", 15], ["Lab", 10], ["Model", 15]]);
  const done = (total: number): Mark[] => [
    mk("Assignment", (5 / 60) * total, 5),
    mk("CT-1", (15 / 60) * total, 15),
    mk("CT-2", (15 / 60) * total, 15),
    mk("Lab", (10 / 60) * total, 10),
    mk("Model", (15 / 60) * total, 15),
  ];

  function endSemNeeds(internalTotal: number) {
    const p = solveSubjectPlan(
      subj({ internal: 60, complete: false, components: full }),
      done(internalTotal),
      "A"
    );
    return {
      plan: p,
      // What each grade costs out of the /40, whether or not 40 is
      // enough — reachability is asserted separately.
      table: Object.fromEntries(
        p.perGrade.map((g) => [g.grade, Number(g.needed.toFixed(2))])
      ),
    };
  }

  it("leaves exactly the end-sem in play once every internal is marked", () => {
    const { plan } = endSemNeeds(45);
    expect(plan.banked).toBeCloseTo(45, 6);
    expect(plan.pool).toBe(40);
    expect(plan.remainingInternal).toBe(0);
    const pending = plan.components.filter((c) => c.obtained === null);
    expect(pending).toHaveLength(1);
    expect(pending[0].kind).toBe("external");
    expect(pending[0].max).toBe(40);
  });

  it("prices every grade off a 45/60 internal", () => {
    // Threshold minus what's banked, straight out of the /40.
    expect(endSemNeeds(45).table).toEqual({
      O: 46, // 91 - 45, more than 40 exists...
      "A+": 36,
      A: 26,
      "B+": 16,
      B: 11,
      C: 5,
    });
    // ...so O is correctly reported as gone, the rest as reachable.
    const p = endSemNeeds(45).plan;
    expect(p.perGrade.find((g) => g.grade === "O")!.achievable).toBe(false);
    expect(p.bestReachable).toBe("A+");
  });

  it("prices every grade off a 30/60 internal", () => {
    expect(endSemNeeds(30).table).toEqual({
      O: 61,
      "A+": 51,
      A: 41,
      "B+": 31,
      B: 26,
      C: 20,
    });
    // 41 needed out of 40 — one mark short, and it must not round away.
    const p = endSemNeeds(30).plan;
    expect(p.perGrade.find((g) => g.grade === "A")!.achievable).toBe(false);
    expect(p.bestReachable).toBe("B+");
  });

  it("locks the grades a 58/60 internal already secures", () => {
    const p = endSemNeeds(58).plan;
    const secured = p.perGrade.filter((g) => g.secured).map((g) => g.grade);
    expect(secured).toEqual(["B", "C"]); // 58 clears 56 and 50
    expect(p.perGrade.find((g) => g.grade === "O")!.needed).toBeCloseTo(33, 6);
    expect(p.perGrade.find((g) => g.grade === "O")!.achievable).toBe(true);
  });

  it("asks the end-sem for the whole gap, since it is all that's left", () => {
    // With one component remaining the equal-spread rate is 100% of it,
    // so 'required' must equal 'needed' exactly.
    for (const internal of [0, 12.5, 30, 45, 55, 60]) {
      for (const target of GRADES) {
        const p = solveSubjectPlan(
          subj({ internal: 60, complete: false, components: full }),
          done(internal),
          target
        );
        const ext = p.components.find((c) => c.kind === "external")!;
        if (p.status === "out-of-reach") continue;
        expect(ext.required, `internal=${internal} →${target}`).toBeCloseTo(
          Math.max(0, thresholdOf(target) - internal),
          6
        );
      }
    }
  });
});

describe("hostile and malformed input", () => {
  it("refuses to produce NaN from a non-numeric weight", () => {
    const bad = { internal: "sixty", complete: false, components: [] } as unknown as Assessment;
    const p = solveSubjectPlan(subj(bad), [mk("CT-1", 10, 15)], "A");
    assertInvariants(p, "non-numeric weight");
    expect(p.internalWeight).toBe(60); // falls back rather than poisoning every total
  });

  it("survives a NaN or infinite mark", () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      const p = solveSubjectPlan(
        subj({ internal: 60, complete: false, components: comps([["CT-1", 15]]) }),
        [mk("CT-1", bad, 15)],
        "A"
      );
      assertInvariants(p, `mark=${bad}`);
    }
  });

  it("survives a component declared with a NaN weight", () => {
    const bad = {
      internal: 60,
      complete: false,
      components: [{ key: "k", label: "CT-1", type: "CT", max: NaN }],
    } as unknown as Assessment;
    assertInvariants(solveSubjectPlan(subj(bad), [], "A"), "NaN component");
  });

  it("clamps a mark scored above its own maximum", () => {
    // Bonus marks are real; a component worth more than it is worth is not.
    const p = solveSubjectPlan(
      subj({ internal: 60, complete: false, components: comps([["CT-1", 15]]) }),
      [mk("CT-1", 18, 15)],
      "A"
    );
    assertInvariants(p, "over-max mark");
    expect(p.banked).toBeLessThanOrEqual(15 + 1e-9);
  });

  it("floors a negative mark at zero", () => {
    const p = solveSubjectPlan(
      subj({ internal: 60, complete: false, components: comps([["CT-1", 15]]) }),
      [mk("CT-1", -5, 15)],
      "A"
    );
    assertInvariants(p, "negative mark");
    expect(p.banked).toBe(0);
  });

  it("never lets a target of F stand in for a real one", () => {
    const p = solveSubjectPlan(subj(null), [], "F" as Grade);
    assertInvariants(p, "F target");
    expect(p.target.grade).not.toBe("F");
  });

  it("takes every external mark together rather than an arbitrary one", () => {
    const p = solveSubjectPlan(
      subj({ internal: 60, complete: false, components: [] }),
      [mk("End sem part A", 15, 25, true), mk("End sem part B", 10, 25, true)],
      "A"
    );
    assertInvariants(p, "two externals");
    expect(p.banked).toBeCloseTo((25 / 50) * 40, 6);
  });

  it("counts a duplicate label once against the plan and once as extra", () => {
    const p = solveSubjectPlan(
      subj({ internal: 60, complete: false, components: comps([["CT-1", 15]]) }),
      [mk("CT-1", 12, 15), mk("CT-1", 9, 15)],
      "A"
    );
    assertInvariants(p, "duplicate labels");
    expect(p.components.filter((c) => c.obtained !== null)).toHaveLength(2);
  });

  it("handles a plan with more components than the weight can hold", () => {
    const p = solveSubjectPlan(
      subj({ internal: 60, complete: false, components: comps(Array.from({ length: 40 }, (_, i) => [`T${i}`, 5])) }),
      [],
      "A"
    );
    assertInvariants(p, "40 components");
    expect(p.scaled).toBe(true);
    expect(p.components.filter((c) => c.kind === "planned")).toHaveLength(40);
  });
});

describe("gradeForTargetSgpa across the whole scale", () => {
  it("maps every half-point of target SGPA to a grade that can produce it", () => {
    for (let t = 0; t <= 10.0001; t += 0.5) {
      const g = gradeForTargetSgpa(t);
      const points = GRADE_TABLE.find((r) => r.grade === g)!.points;
      expect(points, `target ${t} → ${g}`).toBeGreaterThanOrEqual(Math.min(10, Math.ceil(t - 1e-9)));
      expect(g).not.toBe("F");
    }
  });

  it("does not fall over on nonsense", () => {
    for (const t of [NaN, -5, 99, Infinity, -Infinity]) {
      expect(GRADES).toContain(gradeForTargetSgpa(t));
    }
  });
});

describe("rounding must never contradict the grade beside it", () => {
  it("floors a total, so the number and the grade always agree", () => {
    // The bug: the card rounded for display but graded the exact value,
    // so every threshold had a half-mark band where it printed a total
    // sitting *on* the next grade next to the grade below — 70.6 shown
    // as "71/100 · B+", 49.6 as "50/100 · F".
    // Stepped as integers over ten, so the loop tests the property
    // rather than the drift of repeated += 0.1.
    for (let i = 0; i <= 1000; i++) {
      const total = i / 10;
      const shown = floorTotal(total);
      expect(gradeForTotal(shown).grade, `${total} → ${shown}`).toBe(
        gradeForTotal(total).grade
      );
      expect(shown).toBeLessThanOrEqual(total + 1e-9);
    }
  });

  it("rounds a mark you must reach up and a mark you hold down", () => {
    expect(ceilHalf(10.4)).toBe(10.5); // 10 would not be enough
    expect(floorHalf(10.4)).toBe(10); // you have not earned 10.5
    expect(ceilHalf(42.36)).toBe(42.5);
    expect(floorHalf(42.36)).toBe(42);
    for (const n of [0, 0.25, 7, 12.5, 59.9]) {
      expect(floorHalf(n)).toBeLessThanOrEqual(n + 1e-9);
      expect(ceilHalf(n)).toBeGreaterThanOrEqual(n - 1e-9);
      expect(Object.is(floorHalf(n), -0)).toBe(false);
    }
  });

  it("keeps component keys unique, since they become React keys", () => {
    // A plan can carry duplicates: jsonb edited by hand, or a row
    // duplicated in the editor.
    const dupe = subj({
      internal: 60,
      complete: false,
      components: [
        { key: "same", label: "CT-1", type: "CT", max: 15 },
        { key: "same", label: "CT-2", type: "CT", max: 15 },
        { key: "same", label: "CT-3", type: "CT", max: 15 },
      ],
    });
    const keys = solveSubjectPlan(dupe, [], "A").components.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain("same");
    expect(keys).toContain("same#2");
  });
});
