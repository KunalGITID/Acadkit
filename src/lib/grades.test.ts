import { describe, expect, it } from "vitest";
import { computeSgpa, computeSubjectMarks, gradeForTotal } from "@/lib/grades";
import type { Mark, Subject } from "@/types";

const subj = (over: Partial<Subject>): Subject => ({
  id: over.id ?? "s1",
  device_id: "p",
  code: over.code ?? "X",
  name: over.name ?? "X",
  credits: over.credits ?? 4,
  type: "theory",
  faculty: null,
  color_hex: "#000",
  ...over,
});

const mk = (subject_id: string, obtained: number, max: number): Mark => ({
  id: Math.random().toString(),
  device_id: "p",
  subject_id,
  component_type: "CT",
  label: "CT-1",
  marks_obtained: obtained,
  max_marks: max,
  is_external: false,
});

describe("gradeForTotal", () => {
  it("maps totals to grades + points", () => {
    expect(gradeForTotal(95)).toEqual({ grade: "O", points: 10 });
    expect(gradeForTotal(85)).toEqual({ grade: "A+", points: 9 });
    expect(gradeForTotal(75)).toEqual({ grade: "A", points: 8 });
    expect(gradeForTotal(65)).toEqual({ grade: "B+", points: 7 });
    expect(gradeForTotal(58)).toEqual({ grade: "B", points: 6 });
    expect(gradeForTotal(52)).toEqual({ grade: "C", points: 5 });
    expect(gradeForTotal(40)).toEqual({ grade: "F", points: 0 });
  });

  it("uses inclusive lower bounds", () => {
    expect(gradeForTotal(91).grade).toBe("O");
    expect(gradeForTotal(90).grade).toBe("A+");
    expect(gradeForTotal(50).grade).toBe("C");
    expect(gradeForTotal(49).grade).toBe("F");
  });
});

describe("computeSubjectMarks", () => {
  it("projects predicted total from internal pace", () => {
    const m = computeSubjectMarks([mk("s1", 12, 15)]); // 80%
    expect(m.internalObtained).toBe(12);
    expect(m.internalMax).toBe(15);
    expect(m.predictedTotal).toBeCloseTo(80, 5);
    expect(m.grade).toBe("A");
    expect(m.hasAnyMarks).toBe(true);
  });

  it("ignores external marks (they arrive after the sem)", () => {
    const ext: Mark = { ...mk("s1", 30, 40), is_external: true, component_type: "External" };
    const m = computeSubjectMarks([mk("s1", 13, 15), ext]);
    expect(m.internalComponents).toHaveLength(1);
    expect(m.internalObtained).toBe(13);
  });

  it("handles no marks", () => {
    const m = computeSubjectMarks([]);
    expect(m.hasAnyMarks).toBe(false);
    expect(m.predictedTotal).toBe(0);
  });
});

describe("computeSgpa", () => {
  it("weights grade points by credits, excludes 0-credit + unmarked", () => {
    const subjects = [
      subj({ id: "a", credits: 4 }), // A+ (13/15=86.7)
      subj({ id: "b", credits: 4 }), // A (12/15=80)
      subj({ id: "z", credits: 0 }), // audit, excluded
      subj({ id: "n", credits: 3 }), // no marks, excluded
    ];
    const map = new Map<string, Mark[]>([
      ["a", [mk("a", 13, 15)]],
      ["b", [mk("b", 12, 15)]],
      ["z", [mk("z", 15, 15)]],
    ]);
    const r = computeSgpa(subjects, map);
    expect(r.totalCredits).toBe(8);
    expect(r.countedSubjects).toBe(2);
    expect(r.sgpa).toBeCloseTo((9 * 4 + 8 * 4) / 8, 5); // 8.5
    // raw internal sum spans all marked subjects (incl. audit): 13+12+15
    expect(r.totalObtained).toBe(40);
  });

  it("returns null sgpa with no credit-bearing marks", () => {
    expect(computeSgpa([subj({ credits: 0 })], new Map()).sgpa).toBeNull();
  });
});
