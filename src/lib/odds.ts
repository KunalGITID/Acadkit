import { GRADE_TABLE, gradeForTotal } from "@/lib/grades";
import type { SubjectGradeProjection } from "@/lib/projections";
import type { Grade } from "@/types";

/**
 * Grade odds: how likely each grade is, not just the one your pace
 * points at.
 *
 * A pace line quietly claims you will reproduce your average exactly.
 * This asks what your marks so far say about the marks still to come,
 * and simulates the rest of the semester a few thousand times.
 *
 * **The model.** Each subject has an underlying ability μ — the share of
 * a component's marks you tend to take. A component's score is a draw
 * around it: `ratio ~ Beta(μ·κc, (1−μ)·κc)`, where κc says how much your
 * components swing (a 14/15 next to a 2/15 is a low κc).
 *
 * **Borrowing strength.** Two marks in one subject say little on their
 * own, so μ gets a prior fitted to all your subjects together (empirical
 * Bayes): its centre is your overall average, and its strength comes
 * from how much your subjects differ from each other. A subject with
 * little evidence sits near your usual level; one with plenty follows
 * its own marks. The posterior over μ is computed on a grid, exactly,
 * rather than approximated.
 *
 * **The rest of the semester.** Every component still to come is drawn
 * from the posterior predictive. The end-sem is one paper, so it swings
 * more (a lower κ). A semester-wide shock shared by every subject in a
 * draw makes good and bad terms move together, which is what widens the
 * SGPA range honestly. A subject you are barred from sitting scores zero
 * in its end-sem.
 *
 * Pure and deterministic: the random draws come from a seeded generator,
 * so the same marks always give the same odds and nothing on screen
 * flickers between renders.
 *
 * What it deliberately ignores: an end-sem score you told the app to
 * *assume*. That redistributes what the internals are asked for, but it
 * must never flatter a forecast — the same rule the pace bracket keeps.
 */

/** Names the forecaster in the forecast log, so it is only ever scored against itself. */
export const ODDS_MODEL = "beta-grid-v1";

const DEFAULT_DRAWS = 3000;
const GRID_SIZE = 100;
/** Spread of the shared semester shock, on the logit scale. */
const SHOCK_SD = 0.25;
/** The end-sem is a single paper, so it gets at most this much concentration. */
const EXAM_KAPPA = 6;
/** Unannounced internal marks are several tests, not one; split into pieces this size. */
const PIECE_MARKS = 12;

// ---------- random numbers ----------

/** A small, fast, seedable PRNG (mulberry32). Returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a, for turning a subject id into its own seed. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function normal(rng: () => number): number {
  // Box–Muller; 1 − u keeps the log away from zero.
  const u = 1 - rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Gamma(shape, 1) by Marsaglia & Tsang, with the usual boost below 1. */
function gamma(shape: number, rng: () => number): number {
  if (shape < 1) return gamma(shape + 1, rng) * Math.pow(1 - rng(), 1 / shape);
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      x = normal(rng);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = 1 - rng();
    if (u < 1 - 0.0331 * x ** 4) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

export function betaSample(a: number, b: number, rng: () => number): number {
  const x = gamma(a, rng);
  const y = gamma(b, rng);
  return x + y > 0 ? x / (x + y) : 0.5;
}

/** ln Γ(x) for x > 0 (Lanczos, g = 7). */
function lgamma(x: number): number {
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  const z = x - 1;
  let a = c[0];
  const t = z + 7.5;
  for (let i = 1; i < 9; i++) a += c[i] / (z + i);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// ---------- the prior, fitted to all your subjects ----------

export interface OddsPrior {
  /** Your typical component share, across every subject. */
  mean: number;
  /** How strongly a subject is pulled toward that mean (prior sample size). */
  strength: number;
  /** How tightly one subject's components cluster around its ability. */
  spread: number;
}

/**
 * Empirical-Bayes prior from every graded component, grouped by subject.
 *
 * Method of moments, bounded so a handful of marks can't produce an
 * absurdly confident (or absurdly vague) prior. With nothing graded at
 * all it falls back to a wide prior centred on 70%.
 */
export function fitPrior(subjectRatios: number[][]): OddsPrior {
  const all = subjectRatios.flat();
  if (all.length === 0) return { mean: 0.7, strength: 2, spread: 8 };
  const mean = clamp(all.reduce((a, r) => a + r, 0) / all.length, 0.05, 0.95);

  const withData = subjectRatios.filter((r) => r.length > 0);
  const means = withData.map((r) => r.reduce((a, x) => a + x, 0) / r.length);
  let strength = 4;
  if (means.length >= 3) {
    const m = means.reduce((a, x) => a + x, 0) / means.length;
    const between = means.reduce((a, x) => a + (x - m) ** 2, 0) / (means.length - 1);
    strength = between <= 1e-6 ? 30 : clamp((mean * (1 - mean)) / between - 1, 2, 30);
  }

  let residual = 0;
  let dof = 0;
  withData.forEach((r, i) => {
    if (r.length < 2) return;
    for (const x of r) residual += (x - means[i]) ** 2;
    dof += r.length - 1;
  });
  const spread =
    dof >= 2
      ? residual / dof <= 1e-6
        ? 60
        : clamp((mean * (1 - mean)) / (residual / dof) - 1, 3, 60)
      : 8;

  return { mean, strength, spread };
}

// ---------- the posterior over a subject's ability ----------

const GRID = Array.from({ length: GRID_SIZE }, (_, i) => (i + 0.5) / GRID_SIZE);

/** Normalised posterior weights over GRID for one subject's graded ratios. */
export function posterior(ratios: number[], prior: OddsPrior): number[] {
  const { mean: m, strength: k0, spread: kc } = prior;
  const logs = GRID.map((mu) => {
    let lp = (m * k0 - 1) * Math.log(mu) + ((1 - m) * k0 - 1) * Math.log(1 - mu);
    const a = mu * kc;
    const b = (1 - mu) * kc;
    const lnB = lgamma(a) + lgamma(b) - lgamma(a + b);
    for (const raw of ratios) {
      // A perfect or zero score has zero density at the edge of a Beta;
      // pulling it in a touch keeps one 15/15 from ruling out μ < 1.
      const r = clamp(raw, 0.02, 0.98);
      lp += (a - 1) * Math.log(r) + (b - 1) * Math.log(1 - r) - lnB;
    }
    return lp;
  });
  const top = Math.max(...logs);
  const w = logs.map((l) => Math.exp(l - top));
  const sum = w.reduce((a, x) => a + x, 0);
  return w.map((x) => x / sum);
}

/** Running totals of posterior weights, for inverse-CDF sampling. */
function cumulative(weights: number[]): Float64Array {
  const out = new Float64Array(weights.length);
  let run = 0;
  weights.forEach((w, i) => (out[i] = run += w));
  return out;
}

/** One ability draw: pick a grid cell by its weight, then a point inside it. */
function sampleGrid(cdf: Float64Array, rng: () => number): number {
  const u = rng() * cdf[cdf.length - 1];
  let lo = 0;
  let hi = cdf.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cdf[mid] < u) lo = mid + 1;
    else hi = mid;
  }
  return clamp(GRID[lo] + (rng() - 0.5) / GRID_SIZE, 1e-4, 1 - 1e-4);
}

// ---------- simulation ----------

export interface SubjectOdds {
  subjectId: string;
  target: Grade;
  /** P(final grade = g). */
  distribution: Record<Grade, number>;
  /** P(final grade is the target or better). */
  pTarget: number;
  /** P(at least 50/100 — a pass). */
  pPass: number;
  /** Final /100: median and the middle 80%. */
  median: number;
  p10: number;
  p90: number;
  /** Posterior mean ability, 0–1: the share of a component you're expected to take. */
  ability: number;
  /** Graded components the odds rest on. */
  evidence: number;
  /** Nothing left to play for: the total is already certain. */
  final: boolean;
  barred: boolean;
}

export interface SemesterOdds {
  subjects: SubjectOdds[];
  /** Credit-weighted SGPA across credit-bearing subjects; null when none. */
  sgpa: { target: number; pTarget: number; median: number; p10: number; p90: number } | null;
}

interface Piece {
  marks: number;
  exam: boolean;
}

function quantile(sorted: Float64Array, q: number): number {
  if (sorted.length === 0) return 0;
  const i = clamp(Math.round(q * (sorted.length - 1)), 0, sorted.length - 1);
  return sorted[i];
}

const POINTS = new Map(GRADE_TABLE.map((g) => [g.grade, g.points]));

/** What is still to come, split the way it will actually be assessed. */
function piecesOf(p: SubjectGradeProjection): Piece[] {
  const out: Piece[] = [];
  for (const c of p.plan.components) {
    if (c.obtained !== null || c.max <= 1e-9) continue;
    if (c.kind === "external") {
      out.push({ marks: c.max, exam: true });
    } else if (c.kind === "unannounced") {
      const n = Math.max(1, Math.round(c.max / PIECE_MARKS));
      for (let i = 0; i < n; i++) out.push({ marks: c.max / n, exam: false });
    } else {
      out.push({ marks: c.max, exam: false });
    }
  }
  return out;
}

function ratiosOf(p: SubjectGradeProjection): number[] {
  return p.plan.components
    .filter((c) => c.obtained !== null && c.max > 1e-9)
    .map((c) => clamp((c.obtained as number) / c.max, 0, 1));
}

const logit = (x: number) => Math.log(x / (1 - x));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/**
 * Odds for every subject, and the SGPA they add up to.
 *
 * Draw k of every subject shares one semester shock, and SGPA is read
 * off draw k across subjects — so the SGPA range reflects subjects
 * moving together, not six independent coin flips averaging out.
 */
export function gradeOdds(
  projections: SubjectGradeProjection[],
  targetSgpa: number,
  draws: number = DEFAULT_DRAWS
): SemesterOdds {
  if (projections.length === 0) return { subjects: [], sgpa: null };

  const ratios = projections.map(ratiosOf);
  const prior = fitPrior(ratios);
  const shockRng = mulberry32(0x5eed);
  const shocks = Float64Array.from({ length: draws }, () => normal(shockRng) * SHOCK_SD);

  const totals: Float64Array[] = [];
  const subjects: SubjectOdds[] = projections.map((p, idx) => {
    const weights = posterior(ratios[idx], prior);
    const cdf = cumulative(weights);
    const ability = weights.reduce((a, w, i) => a + w * GRID[i], 0);
    const pieces = piecesOf(p);
    const barred = p.eligibility.status === "barred";
    const rng = mulberry32(hash(p.subject.id));
    const out = new Float64Array(draws);

    for (let k = 0; k < draws; k++) {
      const mu = sigmoid(logit(sampleGrid(cdf, rng)) + shocks[k]);
      let total = p.plan.banked;
      for (const piece of pieces) {
        if (piece.exam && barred) continue;
        const kappa = piece.exam ? Math.min(prior.spread, EXAM_KAPPA) : prior.spread;
        total += piece.marks * betaSample(mu * kappa, (1 - mu) * kappa, rng);
      }
      out[k] = total;
    }
    totals.push(out);

    const distribution = Object.fromEntries(GRADE_TABLE.map((g) => [g.grade, 0])) as Record<Grade, number>;
    for (const t of out) distribution[gradeForTotal(t).grade] += 1 / draws;
    const targetPoints = POINTS.get(p.targetGrade) ?? 0;
    const pTarget = GRADE_TABLE.filter((g) => g.points >= targetPoints && g.grade !== "F").reduce(
      (a, g) => a + distribution[g.grade],
      0
    );
    const sorted = Float64Array.from(out).sort();

    return {
      subjectId: p.subject.id,
      target: p.targetGrade,
      distribution,
      pTarget: clamp(pTarget, 0, 1),
      pPass: clamp(1 - distribution.F, 0, 1),
      median: quantile(sorted, 0.5),
      p10: quantile(sorted, 0.1),
      p90: quantile(sorted, 0.9),
      ability,
      evidence: ratios[idx].length,
      final: pieces.length === 0,
      barred,
    };
  });

  const credited = projections
    .map((p, i) => ({ credits: p.subject.credits, totals: totals[i] }))
    .filter((x) => x.credits > 0);
  if (credited.length === 0) return { subjects, sgpa: null };

  const creditSum = credited.reduce((a, x) => a + x.credits, 0);
  const sgpas = new Float64Array(draws);
  for (let k = 0; k < draws; k++) {
    let points = 0;
    for (const x of credited) points += gradeForTotal(x.totals[k]).points * x.credits;
    sgpas[k] = points / creditSum;
  }
  const hit = sgpas.reduce((a, s) => a + (s >= targetSgpa - 1e-9 ? 1 : 0), 0) / draws;
  const sorted = Float64Array.from(sgpas).sort();
  return {
    subjects,
    sgpa: {
      target: targetSgpa,
      pTarget: hit,
      median: quantile(sorted, 0.5),
      p10: quantile(sorted, 0.1),
      p90: quantile(sorted, 0.9),
    },
  };
}

/** "62%", with the ends said honestly: never a flat 0% or 100% from a simulation. */
export function formatChance(p: number): string {
  if (p >= 0.995) return ">99%";
  if (p <= 0.005) return "<1%";
  return `${Math.round(p * 100)}%`;
}
