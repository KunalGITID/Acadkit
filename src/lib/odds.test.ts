import { describe, expect, it } from "vitest";
import {
  betaSample,
  fitPrior,
  formatChance,
  gradeOdds,
  mulberry32,
  posterior,
} from "@/lib/odds";
import { buildProjection } from "@/lib/projections";
import type { Assessment, Mark, Subject } from "@/types";

/**
 * The odds are only worth showing if they behave like odds: certain
 * when the semester is over, confident with lots of evidence, wide with
 * little, ordered sensibly, and identical run to run.
 */

const WINDOW = { start: "2026-07-21", end: "2026-11-18" };

function subject(id: string, assessment: Partial<Assessment>, extra: Partial<Subject> = {}): Subject {
  return {
    id,
    device_id: "0404",
    code: id.toUpperCase(),
    name: id,
    credits: 4,
    type: "theory",
    faculty: null,
    color_hex: "#888",
    assessment: { internal: 60, complete: true, components: [], ...assessment },
    ...extra,
  };
}

const comps = (rows: Array<[string, number]>) =>
  rows.map(([label, max]) => ({ key: label, label, type: "CT" as const, max }));

let seq = 0;
function mark(subjectId: string, label: string, got: number, max: number, external = false): Mark {
  return {
    id: `m${seq++}`,
    device_id: "0404",
    subject_id: subjectId,
    component_type: external ? "External" : "CT",
    label,
    marks_obtained: got,
    max_marks: max,
    is_external: external,
  };
}

const FOUR = comps([["FT-1", 15], ["FT-2", 15], ["FT-3", 15], ["FT-4", 15]]);

function odds(subjects: Subject[], marks: Mark[], targetSgpa = 8.5, draws = 2000) {
  const report = buildProjection(subjects, [], [], marks, [], "2026-09-26", WINDOW, targetSgpa);
  return gradeOdds(report.gradeProjections, targetSgpa, draws);
}

describe("sampling", () => {
  it("is seeded: the same seed gives the same stream", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 5; i++) expect(a()).toBe(b());
  });

  it("draws Beta variates with the right mean", () => {
    const rng = mulberry32(7);
    let sum = 0;
    for (let i = 0; i < 20000; i++) sum += betaSample(3, 1, rng);
    expect(sum / 20000).toBeCloseTo(0.75, 2);
  });
});

describe("the prior", () => {
  it("is wide and centred on 70% with nothing graded", () => {
    expect(fitPrior([[], []])).toEqual({ mean: 0.7, strength: 2, spread: 8 });
  });

  it("centres on your overall average", () => {
    expect(fitPrior([[0.9, 0.8], [0.7], [0.6, 0.65]]).mean).toBeCloseTo(0.73, 2);
  });

  it("pulls a subject with little evidence toward your usual level", () => {
    const prior = { mean: 0.8, strength: 10, spread: 12 };
    const one = posterior([0.3], prior);
    const many = posterior([0.3, 0.3, 0.3, 0.3, 0.3, 0.3], prior);
    const mean = (w: number[]) => w.reduce((a, x, i) => a + x * ((i + 0.5) / 100), 0);
    // One bad result moves you part of the way; six of them move you
    // most of the way. Roughly (10·0.8 + 12·0.3)/22 against (10·0.8 + 72·0.3)/82.
    expect(mean(one)).toBeCloseTo(0.53, 1);
    expect(mean(many)).toBeCloseTo(0.36, 1);
    expect(mean(one) - mean(many)).toBeGreaterThan(0.1);
  });
});

describe("gradeOdds", () => {
  it("is certain once nothing is left to play for", () => {
    const s = subject("done", { internal: 100, components: comps([["T1", 50], ["T2", 50]]) });
    const r = odds([s], [mark("done", "T1", 45, 50), mark("done", "T2", 38, 50)]);
    const o = r.subjects[0];
    expect(o.final).toBe(true);
    expect(o.median).toBeCloseTo(83, 6); // 45 + 38
    expect(o.distribution["A+"]).toBeCloseTo(1, 9);
    expect(o.p10).toBe(o.p90);
  });

  it("is confident about a strong record and wide about an empty one", () => {
    const strong = subject("strong", { components: FOUR });
    const empty = subject("empty", { components: FOUR });
    const marks = ["FT-1", "FT-2", "FT-3"].map((l) => mark("strong", l, 14.5, 15));
    const r = odds([strong, empty], marks);
    const [s, e] = r.subjects;
    expect(s.distribution.O + s.distribution["A+"]).toBeGreaterThan(0.6);
    expect(s.evidence).toBe(3);
    expect(e.evidence).toBe(0);
    // Less evidence, wider range.
    expect(e.p90 - e.p10).toBeGreaterThan(s.p90 - s.p10);
  });

  it("gets less optimistic as the marks get worse", () => {
    const good = subject("good", { components: FOUR });
    const poor = subject("poor", { components: FOUR });
    const marks = [
      ...["FT-1", "FT-2"].map((l) => mark("good", l, 13, 15)),
      ...["FT-1", "FT-2"].map((l) => mark("poor", l, 5, 15)),
    ];
    const [g, p] = odds([good, poor], marks).subjects;
    expect(g.median).toBeGreaterThan(p.median);
    expect(g.pPass).toBeGreaterThan(p.pPass);
    expect(g.ability).toBeGreaterThan(p.ability);
  });

  it("orders its chances: the target or better never beats a lower bar", () => {
    const s = subject("s", { components: FOUR }, { target_grade: "A+" });
    const lower = subject("t", { components: FOUR }, { target_grade: "B" });
    const marks = [
      ...["FT-1", "FT-2"].map((l) => mark("s", l, 11, 15)),
      ...["FT-1", "FT-2"].map((l) => mark("t", l, 11, 15)),
    ];
    const [aPlus, b] = odds([s, lower], marks).subjects;
    expect(aPlus.pTarget).toBeLessThanOrEqual(b.pTarget + 1e-9);
    const total = Object.values(aPlus.distribution).reduce((a, x) => a + x, 0);
    expect(total).toBeCloseTo(1, 9);
    expect(aPlus.p10).toBeLessThanOrEqual(aPlus.median);
    expect(aPlus.median).toBeLessThanOrEqual(aPlus.p90);
  });

  it("scores a barred subject's end-sem as zero", () => {
    const s = subject("s", { components: FOUR });
    const marks = ["FT-1", "FT-2", "FT-3", "FT-4"].map((l) => mark("s", l, 12, 15));
    const report = buildProjection([s], [], [], marks, [], "2026-09-26", WINDOW, 8.5);
    const p = report.gradeProjections[0];
    const barred = { ...p, eligibility: { ...p.eligibility, status: "barred" as const } };
    const free = gradeOdds([p], 8.5, 1500).subjects[0];
    const shut = gradeOdds([barred], 8.5, 1500).subjects[0];
    expect(shut.barred).toBe(true);
    // 48/60 internals and nothing from the paper is a 48: an F.
    expect(shut.median).toBeCloseTo(48, 6);
    expect(shut.pPass).toBeLessThan(free.pPass);
  });

  it("gives an SGPA range that brackets its median", () => {
    const a = subject("a", { components: FOUR });
    const b = subject("b", { components: FOUR }, { credits: 3 });
    const marks = [
      ...["FT-1", "FT-2"].map((l) => mark("a", l, 12, 15)),
      ...["FT-1", "FT-2"].map((l) => mark("b", l, 10, 15)),
    ];
    const r = odds([a, b], marks, 7);
    expect(r.sgpa).not.toBeNull();
    expect(r.sgpa!.p10).toBeLessThanOrEqual(r.sgpa!.median);
    expect(r.sgpa!.median).toBeLessThanOrEqual(r.sgpa!.p90);
    expect(odds([a, b], marks, 0).sgpa!.pTarget).toBeCloseTo(1, 9);
    expect(odds([a, b], marks, 10.5).sgpa!.pTarget).toBe(0);
  });

  it("leaves 0-credit subjects out of the SGPA", () => {
    const audit = subject("audit", { components: FOUR }, { credits: 0 });
    expect(odds([audit], []).sgpa).toBeNull();
  });

  it("is deterministic", () => {
    const s = subject("s", { components: FOUR });
    const marks = [mark("s", "FT-1", 9, 15)];
    expect(odds([s], marks)).toEqual(odds([s], marks));
  });

  it("gives each subject its own draws, so adding one leaves the others alone", () => {
    const a = subject("a", { components: FOUR });
    const b = subject("b", { components: FOUR });
    const marks = [mark("a", "FT-1", 9, 15), mark("a", "FT-2", 11, 15), mark("b", "FT-1", 9, 15), mark("b", "FT-2", 11, 15)];
    const alone = odds([a], marks.slice(0, 2)).subjects[0];
    const together = odds([a, b], marks).subjects[0];
    // Same subject, same marks, same own-evidence: only the shared prior moves.
    expect(Math.abs(alone.median - together.median)).toBeLessThan(3);
  });
});

describe("formatChance", () => {
  it("never claims certainty a simulation can't give", () => {
    expect(formatChance(1)).toBe(">99%");
    expect(formatChance(0)).toBe("<1%");
    expect(formatChance(0.623)).toBe("62%");
  });
});
