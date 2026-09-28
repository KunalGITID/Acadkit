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

/** The epsilon is not cosmetic. */
const BOUNDARY_EPSILON = 1e-9;

export function gradeForTotal(total: number): { grade: Grade; points: number } {
  const row =
    GRADE_TABLE.find((g) => total >= g.min - BOUNDARY_EPSILON) ??
    GRADE_TABLE[GRADE_TABLE.length - 1];
  return { grade: row.grade, points: row.points };
}

/** SRM's mandatory courses (category M, the LEM codes: Professional Ethics, Universal Human Values II, the Indian-knowledge courses) are non-graded. */
const NON_GRADED = /^\d{2}LEM\d{3}[A-Z]$/i;

export function isNonGraded(code: string | null | undefined): boolean {
  return NON_GRADED.test((code ?? "").replace(/\s/g, ""));
}

/**
 * Whether a course's grade enters the SGPA: it carries credits and is not
 * one of the non-graded mandatory courses. Every SGPA and CGPA asks this,
 * so a 3-credit UHV-II can't move one number while leaving another alone.
 */
export function countsInSgpa(c: { code?: string | null; credits: number }): boolean {
  return c.credits > 0 && !isNonGraded(c.code);
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
