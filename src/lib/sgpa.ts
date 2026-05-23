export interface GradeResult {
  grade: string;
  gradePoints: number;
  totalMark: number;
  internalScaled: number;
  externalMark: number;
  percentage: number;
}

export interface SubjectSGPAResult {
  subjectId: string;
  subjectName: string;
  credits: number;
  gradeResult: GradeResult | null;
  isComplete: boolean;
}

export function getGrade(total: number): { grade: string; points: number } {
  if (total >= 91) return { grade: "O", points: 10 };
  if (total >= 81) return { grade: "A+", points: 9 };
  if (total >= 71) return { grade: "A", points: 8 };
  if (total >= 61) return { grade: "B+", points: 7 };
  if (total >= 56) return { grade: "B", points: 6 };
  if (total >= 50) return { grade: "C", points: 5 };
  return { grade: "F", points: 0 };
}

export function scaleInternalTo60(
  internals: { marks_obtained: number; max_marks: number }[]
): number {
  if (internals.length === 0) return 0;
  const totalObtained = internals.reduce((s, r) => s + Number(r.marks_obtained), 0);
  const totalMax = internals.reduce((s, r) => s + Number(r.max_marks), 0);
  if (totalMax === 0) return 0;
  return Math.round((totalObtained / totalMax) * 60 * 100) / 100;
}

export function computeGradeResult(
  internalRecords: { marks_obtained: number; max_marks: number }[],
  externalRecord: { marks_obtained: number; max_marks: number } | null
): GradeResult | null {
  if (internalRecords.length === 0 && !externalRecord) return null;

  const internalScaled = scaleInternalTo60(internalRecords);
  const externalMark = externalRecord
    ? Math.round(
        (Number(externalRecord.marks_obtained) /
          Number(externalRecord.max_marks)) *
          40 *
          100
      ) / 100
    : 0;
  const totalMark = Math.round((internalScaled + externalMark) * 100) / 100;
  const { grade, points } = getGrade(totalMark);

  return {
    grade,
    gradePoints: points,
    totalMark,
    internalScaled,
    externalMark,
    percentage: totalMark,
  };
}

export function computeSGPA(results: SubjectSGPAResult[]): number | null {
  const completed = results.filter((r) => r.gradeResult !== null);
  if (completed.length === 0) return null;

  const totalPoints = completed.reduce(
    (s, r) => s + r.gradeResult!.gradePoints * r.credits,
    0
  );
  const totalCredits = completed.reduce((s, r) => s + r.credits, 0);
  return totalCredits === 0
    ? null
    : Math.round((totalPoints / totalCredits) * 100) / 100;
}

const GRADE_MIN_MAP: Record<string, number> = {
  O: 91,
  "A+": 81,
  A: 71,
  "B+": 61,
  B: 56,
  C: 50,
  F: 0,
};

export function predictRequiredInternal(
  targetGrade: string,
  externalMark: number
): number {
  const minTotal = GRADE_MIN_MAP[targetGrade] ?? 50;
  return Math.max(0, Math.round((minTotal - externalMark) * 100) / 100);
}

export function predictRequiredExternal(
  targetGrade: string,
  internalScaled: number
): number {
  const minTotal = GRADE_MIN_MAP[targetGrade] ?? 50;
  return Math.max(0, Math.round((minTotal - internalScaled) * 100) / 100);
}

export const GRADE_OPTIONS = ["O", "A+", "A", "B+", "B", "C"] as const;
