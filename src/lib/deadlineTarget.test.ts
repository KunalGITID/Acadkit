import { describe, expect, it } from "vitest";
import { deadlineTarget, describeTarget } from "@/lib/deadlineTarget";
import type { Assessment, Mark, Subject } from "@/types";

/**
 * These numbers moved when deadlines came off the rate model.
 *
 * The old version asked "what fraction of my entered marks have I
 * earned, and what does adding this test do to it" — which quietly
 * treats the marks you happen to have as the whole course. That is why
 * it used to call a grade safe on the strength of 45/50 with a whole
 * semester unplayed. Deadlines now read the same budget the Insights
 * card does, so the answers agree with it and with each other.
 */

const sub = (assessment: Assessment | null = null): Subject => ({
  id: "s1",
  device_id: "0404",
  code: "X",
  name: "X",
  credits: 4,
  type: "theory",
  faculty: null,
  color_hex: "#000",
  assessment,
});

const mark = (obtained: number, max: number): Mark => ({
  id: `${obtained}-${max}`,
  device_id: "0404",
  subject_id: "s1",
  component_type: "CT",
  label: "CT",
  marks_obtained: obtained,
  max_marks: max,
  is_external: false,
});

describe("deadlineTarget", () => {
  it("says nothing when the test carries no marks", () => {
    // A lab record with no denominator has no target to compute.
    expect(deadlineTarget({ max_marks: null }, sub(), [mark(20, 25)])).toBeNull();
    expect(deadlineTarget({ max_marks: 0 }, sub(), [mark(20, 25)])).toBeNull();
  });

  it("says nothing before there is a pace to hold", () => {
    // Every grade is still open; a target here would be arithmetic, not
    // advice.
    expect(deadlineTarget({ max_marks: 25 }, sub(), [])).toBeNull();
  });

  it("offers exactly the grade you're on and the one above", () => {
    // 20/25 is 80%, which is an A — A+ starts at 81, not 80.
    const t = deadlineTarget({ max_marks: 25 }, sub(), [mark(20, 25)])!;
    expect(t.current).toBe("A");
    expect(t.hold?.grade).toBe("A");
    expect(t.reach?.grade).toBe("A+");
  });

  it("has nothing above the top grade", () => {
    const t = deadlineTarget({ max_marks: 25 }, sub(), [mark(25, 25)])!;
    expect(t.current).toBe("O");
    expect(t.reach).toBeNull();
  });

  it("will not call a grade banked while the semester is still open", () => {
    // 25/25 is a perfect pace, and 25 of the 100 marks. Under the old
    // model that was "O is safe"; in fact 75 marks are unplayed and O
    // still has to be earned across them.
    const t = deadlineTarget({ max_marks: 25 }, sub(), [mark(25, 25)])!;
    expect(t.hold?.secured).toBe(false);
    expect(describeTarget(t, 25)).toBe("22/25 to hold O");
  });
});

describe("describeTarget", () => {
  it("leads with the improvement when it's reachable", () => {
    // Banked 20 of 100, 75 left. A+ wants 61 of those 75 — 81% of
    // everything remaining, so 20.5 of this 25-mark test.
    const t = deadlineTarget({ max_marks: 25 }, sub(), [mark(20, 25)])!;
    expect(describeTarget(t, 25)).toBe("20.5/25 for A+");
  });

  it("scales with the size of the test", () => {
    // Same equal-effort share, a bigger slice of it.
    const t = deadlineTarget({ max_marks: 50 }, sub(), [mark(8, 10)])!;
    expect(describeTarget(t, 50)).toBe("41/50 for A+");
  });

  it("says a grade is safe only once it truly cannot be lost", () => {
    // 98 of the internal 100 are marked at 92, so O is banked with two
    // marks outstanding: the one case where "safe" is the honest word.
    const nearlyDone = sub({
      internal: 100,
      complete: false,
      components: [
        { key: "a", label: "CT", type: "CT", max: 98 },
        { key: "b", label: "Lab", type: "Lab", max: 2 },
      ],
    });
    const t = deadlineTarget({ max_marks: 2 }, nearlyDone, [mark(92, 98)])!;
    expect(t.hold?.secured).toBe(true);
    expect(describeTarget(t, 2)).toBe("O is safe");
  });

  it("speaks up on an F pace, where there is no grade to hold", () => {
    // The grade table omits F — "what do I need to keep failing" isn't a
    // question — so this would otherwise fall through and say nothing.
    const t = deadlineTarget({ max_marks: 5 }, sub(), [mark(2, 50)])!;
    expect(t.current).toBe("F");
    expect(t.hold).toBeNull();
    // 2 banked, 50 left, C wants 48 of them: 96% of everything, which
    // this 5-mark test owes all of.
    expect(describeTarget(t, 5)).toBe("5/5 for C");
  });

  it("keeps its footing when a test is worth more than what's left", () => {
    // A 100-mark test in a subject with 50 marks unplayed is a data
    // disagreement, not a question — but it must still answer, and the
    // equal-effort share is the best available answer.
    const t = deadlineTarget({ max_marks: 100 }, sub(), [mark(2, 50)])!;
    expect(describeTarget(t, 100)).toBe("96/100 for C");
  });
});
