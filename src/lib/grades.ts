import type { Grade, Mark } from "@/types";

/** Re-exported so the long-standing `from "@/lib/grades"` imports hold. */
export type { Grade };

/** Descending by threshold: O first, F last. */
export const GRADE_TABLE: Array<{ grade: Grade; min: number; points: number }> = [
  { grade: "O", min: 91, points: 10 },
  { grade: "A+", min: 81, points: 9 },
  { grade: "A", min: 71, points: 8 },
  { grade: "B+", min: 61, points: 7 },
  { grade: "B", min: 56, points: 6 },
  { grade: "C", min: 50, points: 5 },
  { grade: "F", min: 0, points: 0 },
];

/**
 * The epsilon is not cosmetic. Totals reach here through the budget
 * engine — weights scaled, shares clamped, halves summed — so a subject
 * that is exactly 81 can arrive as 80.99999999999967, and a student one
 * float ulp below a threshold should not be marked down a grade for it.
 * `floorTotal` in plan.ts absorbs the same error by the same amount, so
 * the displayed total and the grade beside it always agree.
 */
const BOUNDARY_EPSILON = 1e-9;

export function gradeForTotal(total: number): { grade: Grade; points: number } {
  const row =
    GRADE_TABLE.find((g) => total >= g.min - BOUNDARY_EPSILON) ??
    GRADE_TABLE[GRADE_TABLE.length - 1];
  return { grade: row.grade, points: row.points };
}

export const GRADE_COLORS: Record<Grade, string> = {
  O: "#4ade80",
  "A+": "#34d399",
  A: "#22d3ee",
  "B+": "#818cf8",
  B: "#facc15",
  C: "#fb923c",
  F: "#fb7185",
};

/**
 * Where the per-subject and per-semester maths used to live.
 *
 * `computeSubjectMarks` and `computeSgpa` moved to src/lib/plan.ts when
 * the app moved off the rate model: they now need a subject's
 * internal/external split and its component plan, and plan.ts imports
 * this file for the grade table, so keeping them here would have made a
 * cycle. This file is the grade table and nothing else.
 *
 * @see subjectOutlook, computeSgpa in src/lib/plan.ts
 */

/** Group marks by subject id (shared by Marks page and Dashboard). */
export function groupMarksBySubject(marks: Mark[]): Map<string, Mark[]> {
  const map = new Map<string, Mark[]>();
  for (const m of marks) {
    const list = map.get(m.subject_id) ?? [];
    list.push(m);
    map.set(m.subject_id, list);
  }
  return map;
}
