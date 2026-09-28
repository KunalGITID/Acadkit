import { describe, expect, it } from "vitest";
import { expectedFor, expectedOutlook, realisedSgpa, setExpected } from "@/lib/expected";
import type { Mark, Subject } from "@/types";

/**
 * 60/40, internals FT-1 5 + FT-2 15 + FT-3 15 + FT-4 15 + assignment 10.
 * FT-1 came back 2/5; FT-2 has been sat and not returned.
 */
const base: Subject = {
  id: "os",
  device_id: "",
  code: "21CSC202J",
  name: "OS",
  credits: 4,
  type: "theory",
  faculty: null,
  color_hex: "#000",
  assessment: {
    internal: 60,
    complete: true,
    components: [
      { key: "a", label: "FT-1", type: "CT", max: 5 },
      { key: "b", label: "FT-2", type: "CT", max: 15 },
      { key: "c", label: "FT-3", type: "CT", max: 15 },
      { key: "d", label: "FT-4", type: "CT", max: 15 },
      { key: "e", label: "Assignment", type: "Assignment", max: 10 },
    ],
  },
};

const mark = (label: string, obtained: number, max: number): Mark =>
  ({
    id: label,
    subject_id: "os",
    component_type: "CT",
    label,
    marks_obtained: obtained,
    max_marks: max,
    is_external: false,
  }) as Mark;

const ft1 = [mark("FT-1", 2, 5)];
const expecting = (obtained: number): Subject => ({
  ...base,
  assessment: setExpected(base, "FT-2", { obtained, max: 15 }),
});
const row = (o: ReturnType<typeof expectedOutlook>, label: string) =>
  o.rows.find((r) => r.component.label === label)!;

describe("expectedOutlook", () => {
  it("with nothing expected, is the ordinary solve", () => {
    const o = expectedOutlook(base, ft1, "A");
    expect(o.pending).toBe(0);
    expect(o.plan.banked).toBe(o.actual.banked);
    expect(row(o, "FT-2").state).toBe("open");
  });

  it("counts FT-2 as expected and re-targets FT-3 and FT-4", () => {
    const before = expectedOutlook(base, ft1, "A");
    const o = expectedOutlook(expecting(12), ft1, "A");

    expect(o.pending).toBe(1);
    expect(row(o, "FT-2").state).toBe("expected");
    expect(o.plan.banked).toBeCloseTo(2 + 12);
    // Returned marks are untouched: the expectation is not a result.
    expect(o.actual.banked).toBeCloseTo(2);

    // 71 for an A, 14 in hand, 80 left (FT-3, FT-4, assignment, end-sem):
    // every remaining mark at 57/80.
    const ft3 = row(o, "FT-3").component;
    expect(row(o, "FT-3").state).toBe("open");
    expect(ft3.required).toBeCloseTo((57 / 80) * 15);
    // A good FT-2 makes FT-3 cheaper than the plain spread asked.
    expect(ft3.required!).toBeLessThan(row(before, "FT-3").component.required!);
  });

  it("lets the real mark win once it lands, keeping the guess for comparison", () => {
    const o = expectedOutlook(expecting(12), [...ft1, mark("FT-2", 9, 15)], "A");
    expect(o.pending).toBe(0);
    expect(row(o, "FT-2").state).toBe("graded");
    expect(row(o, "FT-2").expected).toEqual({ obtained: 12, max: 15 });
    expect(o.plan.banked).toBeCloseTo(11);
  });

  it("ignores an expectation for a component that no longer exists", () => {
    const stale: Subject = {
      ...base,
      assessment: setExpected(base, "Quiz 9", { obtained: 5, max: 5 }),
    };
    const o = expectedOutlook(stale, ft1, "A");
    expect(o.pending).toBe(0);
    expect(o.rows.some((r) => r.component.label === "Quiz 9")).toBe(false);
  });

  it("matches FT-2 however it was typed", () => {
    const s = { ...base, assessment: setExpected(base, "ft 2", { obtained: 10, max: 15 }) };
    expect(row(expectedOutlook(s, ft1, "A"), "FT-2").state).toBe("expected");
  });
});

describe("deadlines", () => {
  const deadline = (subject_id: string, title: string, max: number) =>
    ({ id: title, device_id: "", subject_id, title, type: "exam", due_date: "2026-11-25T09:00:00Z", max_marks: max }) as never;

  it("adopts only this subject's deadlines", () => {
    const bare: Subject = { ...base, id: "uhv", assessment: null };
    const o = expectedOutlook(bare, [], "A", {
      deadlines: [deadline("os", "21MAB201T Exam", 15), deadline("os", "FT-2", 15)],
      today: "2026-09-26",
    });
    expect(o.rows.map((r) => r.component.label)).not.toContain("21MAB201T Exam");
    expect(o.rows.map((r) => r.state)).toEqual(["unannounced", "external"]);
  });

  it("never adopts T-EXT - that's the end-sem, already the external weight", () => {
    const bare: Subject = { ...base, id: "uhv", assessment: null };
    const o = expectedOutlook(bare, [], "A", { deadlines: [deadline("uhv", "T-EXT", 40)], today: "2026-09-26" });
    expect(o.rows.some((r) => r.component.label === "T-EXT")).toBe(false);
  });
});

describe("setExpected", () => {
  it("leaves the rest of the assessment alone and clears back to null", () => {
    const withPct = { ...base, assessment: { ...base.assessment!, assumedExternalPct: 80 } };
    const set = setExpected(withPct, "FT-2", { obtained: 12, max: 15 });
    expect(set.assumedExternalPct).toBe(80);
    expect(set.components).toHaveLength(5);
    const cleared = setExpected({ ...withPct, assessment: set }, "FT-2", null);
    expect(cleared.expected).toBeNull();
  });

  it("drops junk on read", () => {
    const s = {
      ...base,
      assessment: { ...base.assessment!, expected: { f2: { obtained: NaN, max: 15 } } },
    };
    expect(expectedFor(s)).toEqual({});
  });
});

describe("realisedSgpa", () => {
  const dsa: Subject = { ...base, id: "dsa", credits: 4 };
  const audit: Subject = { ...base, id: "uhv", credits: 0 };

  it("counts each subject at the grade set on it, with expectations in", () => {
    const os = expectedOutlook(expecting(12), ft1, "A");
    const ds = expectedOutlook(dsa, [], "O");
    const r = realisedSgpa([
      { subject: expecting(12), targetGrade: "A", plan: os.plan },
      { subject: dsa, targetGrade: "O", plan: ds.plan },
      { subject: audit, targetGrade: "O", plan: ds.plan },
    ]);
    // A (8) and O (10), four credits each; the audit course is left out.
    expect(r.sgpa).toBe(9);
    expect(r.grades.map((g) => [g.subjectId, g.grade, g.basis])).toEqual([
      ["os", "A", "target"],
      ["dsa", "O", "target"],
    ]);
    expect(r.changed).toBe(0);
  });

  it("never counts a grade the expected marks have ruled out", () => {
    // FT-1 2/5 and FT-2 expected 0/15: 18 of 60 internals gone, so an O
    // (91) needs more than the 80 left.
    const os = expectedOutlook(expecting(0), ft1, "O");
    expect(os.plan.status).toBe("out-of-reach");
    const r = realisedSgpa([{ subject: expecting(0), targetGrade: "O", plan: os.plan }]);
    expect(r.grades[0]).toMatchObject({ grade: os.plan.bestReachable, basis: "best-reachable" });
    expect(r.changed).toBe(1);
  });

  it("holds a barred subject to what its internals alone make it", () => {
    const os = expectedOutlook(expecting(12), ft1, "O");
    const r = realisedSgpa([{ subject: expecting(12), targetGrade: "O", plan: os.plan, barred: true }]);
    expect(r.grades[0]).toMatchObject({ grade: os.plan.floorGrade, basis: "barred" });
  });
});

describe("non-graded courses", () => {
  // UHV-II carries 3 credits on the curriculum, but SRM grades it as a
  // mandatory non-graded course: it never enters the SGPA.
  const uhv: Subject = { ...base, id: "uhv", code: "21LEM202T", name: "Universal Human Values II", credits: 3 };

  it("leave the if-it-all-comes-true SGPA alone", () => {
    const os = expectedOutlook(expecting(12), ft1, "A");
    const u = expectedOutlook(uhv, [], "C");
    const r = realisedSgpa([
      { subject: expecting(12), targetGrade: "A", plan: os.plan },
      { subject: uhv, targetGrade: "C", plan: u.plan },
    ]);
    expect(r.sgpa).toBe(8);
    expect(r.grades.map((g) => g.subjectId)).toEqual(["os"]);
  });
});
