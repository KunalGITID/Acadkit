import { GRADE_TABLE, type Grade, type SubjectMarks } from "@/lib/grades";

/**
 * The reverse of the grade table: instead of "what grade am I on pace
 * for", answer "what do I need on the next test to land an A".
 *
 * The projection model here matches computeSubjectMarks — a subject's
 * total is the ratio of internal marks earned to internal marks
 * available, scaled to /100. So adding a component with `upcomingMax`
 * marks moves the denominator as well as the numerator, which is why
 * the answer is not simply "the gap".
 */

export interface GradeTarget {
  grade: Grade;
  points: number;
  /** Percentage threshold this grade starts at. */
  minTotal: number;
  /** Marks needed on the upcoming component, clamped at 0. */
  required: number;
  /** Same as a share of the upcoming component, for a progress bar. */
  requiredPct: number;
  /** False when even full marks can't get there. */
  achievable: boolean;
  /** True when the grade holds even if you score zero. */
  secured: boolean;
}

/**
 * Marks needed on a component worth `upcomingMax` to finish at
 * `targetPct` overall. May exceed `upcomingMax` (unreachable) or come
 * out negative (already banked) — callers decide how to present that.
 */
export function marksNeeded(
  obtained: number,
  max: number,
  upcomingMax: number,
  targetPct: number
): number {
  return (targetPct / 100) * (max + upcomingMax) - obtained;
}

/**
 * Every passing grade, with what the next component would have to
 * return. Returns [] when there is nothing to solve against — no marks
 * recorded yet, or a component worth nothing.
 */
export function targetsFor(
  current: Pick<SubjectMarks, "internalObtained" | "internalMax">,
  upcomingMax: number
): GradeTarget[] {
  if (upcomingMax <= 0) return [];
  const { internalObtained: obtained, internalMax: max } = current;
  if (max + upcomingMax <= 0) return [];

  return GRADE_TABLE.filter((g) => g.grade !== "F").map((g) => {
    const raw = marksNeeded(obtained, max, upcomingMax, g.min);
    const required = Math.max(0, raw);
    return {
      grade: g.grade,
      points: g.points,
      minTotal: g.min,
      // Marks are typically awarded in halves; rounding up keeps the
      // number honest — 12.1 needed means 12 is not enough.
      required: Math.ceil(required * 2) / 2,
      requiredPct: Math.min(100, (required / upcomingMax) * 100),
      achievable: raw <= upcomingMax,
      secured: raw <= 0,
    };
  });
}

/** The best grade still reachable with full marks on the next component. */
export function bestReachable(targets: GradeTarget[]): GradeTarget | null {
  return targets.find((t) => t.achievable) ?? null;
}

/** The grade that holds even if the next component is a zero. */
export function floorGrade(targets: GradeTarget[]): GradeTarget | null {
  return targets.find((t) => t.secured) ?? null;
}
