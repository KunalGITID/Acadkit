import type { Mark, Subject } from "@/types";

export type Grade = "O" | "A+" | "A" | "B+" | "B" | "C" | "F";

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

export function gradeForTotal(total: number): { grade: Grade; points: number } {
  const row = GRADE_TABLE.find((g) => total >= g.min) ?? GRADE_TABLE[GRADE_TABLE.length - 1];
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

export interface SubjectMarks {
  internalComponents: Mark[];
  /** Raw sums of the internal components entered so far. */
  internalObtained: number;
  internalMax: number;
  /**
   * Predicted total /100: the performance ratio so far projected onto
   * the whole course (assumes you keep scoring at the same level on
   * remaining internals and the external). 12/15 → 80 → A+ pace.
   */
  predictedTotal: number;
  grade: Grade;
  points: number;
  hasAnyMarks: boolean;
}

/** Externals are intentionally ignored — they arrive once, after the semester. */
export function computeSubjectMarks(marks: Mark[]): SubjectMarks {
  const internalComponents = marks.filter((m) => !m.is_external);
  const internalObtained = internalComponents.reduce((s, m) => s + m.marks_obtained, 0);
  const internalMax = internalComponents.reduce((s, m) => s + m.max_marks, 0);
  const predictedTotal =
    internalMax > 0 ? Math.min(100, (internalObtained / internalMax) * 100) : 0;
  const { grade, points } = gradeForTotal(predictedTotal);
  return {
    internalComponents,
    internalObtained,
    internalMax,
    predictedTotal,
    grade,
    points,
    hasAnyMarks: internalComponents.length > 0,
  };
}

export interface SgpaResult {
  sgpa: number | null;
  totalCredits: number;
  countedSubjects: number;
  rows: Array<{ subject: Subject; marks: SubjectMarks }>;
  /** Raw internal sums across all subjects, e.g. 22/30. */
  totalObtained: number;
  totalMax: number;
}

/**
 * Predicted SGPA = Σ(predicted grade_points × credits) / Σ(credits),
 * over credit-bearing subjects that have at least one internal mark.
 * 0-credit (audit) subjects never count.
 */
export function computeSgpa(subjects: Subject[], marksBySubject: Map<string, Mark[]>): SgpaResult {
  const rows = subjects.map((subject) => ({
    subject,
    marks: computeSubjectMarks(marksBySubject.get(subject.id) ?? []),
  }));
  const counted = rows.filter((r) => r.subject.credits > 0 && r.marks.hasAnyMarks);
  const totalCredits = counted.reduce((s, r) => s + r.subject.credits, 0);
  const weighted = counted.reduce((s, r) => s + r.marks.points * r.subject.credits, 0);
  return {
    sgpa: totalCredits > 0 ? weighted / totalCredits : null,
    totalCredits,
    countedSubjects: counted.length,
    rows,
    totalObtained: rows.reduce((s, r) => s + r.marks.internalObtained, 0),
    totalMax: rows.reduce((s, r) => s + r.marks.internalMax, 0),
  };
}

/** Lowest grade whose points reach `points`, or null if even O can't. */
export function minGradeForPoints(points: number) {
  const candidates = [...GRADE_TABLE].reverse().filter((g) => g.grade !== "F");
  return candidates.find((g) => g.points >= points) ?? null;
}

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
