import { describe, expect, it } from "vitest";
import { currentOutcome, gradeThresholds, whatIfMark, whatIfRange } from "@/lib/whatIf";
import type { Mark, Subject } from "@/types";

/**
 * One 4-credit subject, internals worth 60, with two declared 15-mark
 * components. FT-1 is graded; FT-2 is the one being imagined.
 */
const DSA: Subject = {
  id: "dsa",
  device_id: "",
  code: "21CSC201J",
  name: "DSA",
  credits: 4,
  type: "theory",
  faculty: null,
  color_hex: "#000",
  assessment: {
    internal: 60,
    complete: false,
    components: [
      { key: "a", label: "FT-1", type: "CT", max: 15 },
      { key: "b", label: "FT-2", type: "CT", max: 15 },
    ],
  },
};

const mark = (label: string, obtained: number, max: number): Mark =>
  ({
    id: label,
    subject_id: "dsa",
    component_type: "CT",
    label,
    marks_obtained: obtained,
    max_marks: max,
    is_external: false,
  }) as Mark;

const input = (marks: Mark[] = [mark("FT-1", 12, 15)]) => ({
  subjects: [DSA],
  marksBySubject: new Map([["dsa", marks]]),
  subjectId: "dsa",
  component: { label: "FT-2", type: "CT" as const, max: 15 },
});

describe("whatIfMark", () => {
  it("moves the subject up as the imagined mark rises", () => {
    const low = whatIfMark(input(), 5)!;
    const high = whatIfMark(input(), 15)!;
    expect(high.total).toBeGreaterThan(low.total);
    expect(high.sgpa!).toBeGreaterThan(low.sgpa!);
  });

  it("clamps a mark to what the component is out of", () => {
    expect(whatIfMark(input(), 99)!.obtained).toBe(15);
    expect(whatIfMark(input(), -4)!.obtained).toBe(0);
    expect(whatIfMark(input(), 99)!.total).toBe(whatIfMark(input(), 15)!.total);
  });

  /**
   * The trap this exists to avoid: exploring by typing a fake mark in.
   * A hypothetical must leave nothing behind, so the same call twice
   * gives the same answer and the caller's own data is untouched.
   */
  it("changes nothing it was given", () => {
    const marks = [mark("FT-1", 12, 15)];
    const one = input(marks);
    whatIfMark(one, 15);
    whatIfMark(one, 3);
    expect(marks).toHaveLength(1);
    expect(one.marksBySubject.get("dsa")).toHaveLength(1);
    expect(whatIfMark(one, 10)!.total).toBe(whatIfMark(input(), 10)!.total);
  });

  /**
   * A component is one component. Imagining FT-2 on top of an FT-2 that
   * is already graded must replace it, not add a second sitting — which
   * would inflate the internals with marks nobody scored.
   */
  it("replaces a component already graded rather than doubling it", () => {
    const withBoth = input([mark("FT-1", 12, 15), mark("FT-2", 2, 15)]);
    const imagined = whatIfMark(withBoth, 15)!;
    const fresh = whatIfMark(input(), 15)!;
    expect(imagined.total).toBe(fresh.total);
  });

  it("matches a label however it was punctuated", () => {
    const withCt = input([mark("FT-1", 12, 15), mark("ft 2", 2, 15)]);
    expect(whatIfMark(withCt, 15)!.total).toBe(whatIfMark(input(), 15)!.total);
  });

  it("says nothing about a subject that isn't there", () => {
    expect(whatIfMark({ ...input(), subjectId: "nope" }, 10)).toBeNull();
  });
});

describe("currentOutcome", () => {
  it("is the subject as it stands, with nothing imagined", () => {
    const now = currentOutcome(input())!;
    const imagined = whatIfMark(input(), 12)!;
    // Same pace, so imagining the rate you're already scoring at
    // shouldn't move the projection much.
    expect(Math.abs(imagined.total - now.total)).toBeLessThan(6);
  });
});

describe("whatIfRange", () => {
  it("walks the component in half marks, the way marks are awarded", () => {
    const range = whatIfRange(input());
    expect(range[0].obtained).toBe(0);
    expect(range[1].obtained).toBe(0.5);
    expect(range[range.length - 1].obtained).toBe(15);
    expect(range).toHaveLength(31);
  });

  it("never goes backwards", () => {
    const totals = whatIfRange(input()).map((p) => p.total);
    expect([...totals].sort((a, b) => a - b)).toEqual(totals);
  });
});

describe("gradeThresholds", () => {
  it("names the cheapest mark that buys each grade, best first", () => {
    const steps = gradeThresholds(input());
    expect(steps.length).toBeGreaterThan(0);
    const totals = steps.map((s) => s.total);
    expect([...totals].sort((a, b) => b - a)).toEqual(totals);
    // Every threshold is the first mark reaching that grade, so a
    // half-mark less must land in a different one.
    for (const step of steps) {
      if (step.obtained === 0) continue;
      expect(whatIfMark(input(), step.obtained - 0.5)!.grade).not.toBe(step.grade);
    }
  });
});
