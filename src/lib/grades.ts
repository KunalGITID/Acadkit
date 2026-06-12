import type { Mark, Subject } from "@/types";

export type Grade = "O" | "A+" | "A" | "B+" | "B" | "C" | "F";

const GRADE_TABLE: Array<{ grade: Grade; min: number; points: number }> = [
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
  external: Mark | null;
  /** Internal performance scaled to /60 (projection from components entered so far). */
  internal60: number;
  /** External performance scaled to /40. */
  external40: number;
  /** Raw sums for "so far" display. */
  internalObtained: number;
  internalMax: number;
  total: number; // /100
  grade: Grade;
  points: number;
  hasAnyMarks: boolean;
}

export function computeSubjectMarks(marks: Mark[]): SubjectMarks {
  const internalComponents = marks.filter((m) => !m.is_external);
  const external = marks.find((m) => m.is_external) ?? null;

  const internalObtained = internalComponents.reduce((s, m) => s + m.marks_obtained, 0);
  const internalMax = internalComponents.reduce((s, m) => s + m.max_marks, 0);
  const internal60 = internalMax > 0 ? Math.min(60, (internalObtained / internalMax) * 60) : 0;
  const external40 =
    external && external.max_marks > 0
      ? Math.min(40, (external.marks_obtained / external.max_marks) * 40)
      : 0;

  const total = internal60 + external40;
  const { grade, points } = gradeForTotal(total);
  return {
    internalComponents,
    external,
    internal60,
    external40,
    internalObtained,
    internalMax,
    total,
    grade,
    points,
    hasAnyMarks: marks.length > 0,
  };
}

export interface SgpaResult {
  sgpa: number | null;
  totalCredits: number;
  countedSubjects: number;
  rows: Array<{ subject: Subject; marks: SubjectMarks }>;
}

/**
 * SGPA = Σ(grade_points × credits) / Σ(credits), over credit-bearing
 * subjects that have at least one mark entered. 0-credit (audit)
 * subjects never count.
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
  };
}
