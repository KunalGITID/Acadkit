import type { SemesterArchive } from "@/types";

/**
 * CGPA across completed semesters, and what this one has to return to
 * move it somewhere.
 *
 * `targets.ts` already answers "what do I need on the next component"
 * for one subject. This is the same inverse arithmetic a level up, and
 * it's the question that actually motivates anyone in week three: a
 * semester SGPA is only interesting because of where it leaves the
 * CGPA. Computing it in reverse is the difference between a number you
 * read and a number you can aim at.
 *
 * The maths, once: CGPA is credit-weighted, so
 *
 *   target = (priorPoints + sgpa x currentCredits) / (priorCredits + currentCredits)
 *
 * rearranged for the only unknown.
 */

export const MAX_GRADE_POINT = 10;

export interface CompletedRecord {
  /** Σ (sgpa × credits) over archived semesters. */
  points: number;
  credits: number;
  cgpa: number | null;
  semesters: number;
}

export function completedRecord(archives: SemesterArchive[]): CompletedRecord {
  const done = archives.filter((a) => a.sgpa !== null && (a.credits ?? 0) > 0);
  const credits = done.reduce((sum, a) => sum + (a.credits ?? 0), 0);
  const points = done.reduce((sum, a) => sum + (a.sgpa ?? 0) * (a.credits ?? 0), 0);
  return {
    points,
    credits,
    cgpa: credits > 0 ? points / credits : null,
    semesters: done.length,
  };
}

export type TargetVerdict =
  /** Already there whatever this semester does — every outcome clears it. */
  | { kind: "secured"; needed: number }
  /** Reachable: this is the SGPA it takes. */
  | { kind: "reachable"; needed: number }
  /** Out of range: even a perfect semester falls short. */
  | { kind: "impossible"; needed: number; shortfall: number };

/**
 * What this semester must average for the overall CGPA to reach `target`.
 *
 * Returns null when the question has no answer yet — no credits enrolled
 * this semester means there is nothing to solve for, and reporting 0 or
 * Infinity would both read as an answer.
 */
export function sgpaNeededFor(
  target: number,
  completed: CompletedRecord,
  currentCredits: number
): TargetVerdict | null {
  if (currentCredits <= 0) return null;

  const needed =
    (target * (completed.credits + currentCredits) - completed.points) / currentCredits;

  // A negative or zero requirement means the completed record alone
  // already clears the target — worth saying outright rather than
  // printing "you need -1.2".
  if (needed <= 0) return { kind: "secured", needed };
  if (needed > MAX_GRADE_POINT) {
    return { kind: "impossible", needed, shortfall: needed - MAX_GRADE_POINT };
  }
  return { kind: "reachable", needed };
}

/** The usual rungs, with anything already secured or unreachable marked. */
export const LADDER = [7.5, 8, 8.5, 9, 9.5] as const;

export interface Rung {
  target: number;
  verdict: TargetVerdict;
}

export function cgpaLadder(
  completed: CompletedRecord,
  currentCredits: number,
  rungs: readonly number[] = LADDER
): Rung[] {
  const out: Rung[] = [];
  for (const target of rungs) {
    const verdict = sgpaNeededFor(target, completed, currentCredits);
    if (verdict) out.push({ target, verdict });
  }
  return out;
}
