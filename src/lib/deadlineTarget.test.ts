import { describe, expect, it } from "vitest";
import { deadlineTarget, describeTarget } from "@/lib/deadlineTarget";
import type { Mark } from "@/types";

const mark = (obtained: number, max: number): Mark =>
  ({
    id: `${obtained}-${max}`,
    device_id: "0404",
    subject_id: "s1",
    component_type: "CT",
    label: "CT",
    marks_obtained: obtained,
    max_marks: max,
    is_external: false,
  }) as Mark;

describe("deadlineTarget", () => {
  it("says nothing when the test carries no marks", () => {
    // A lab record with no denominator has no target to compute.
    expect(deadlineTarget({ max_marks: null }, [mark(20, 25)])).toBeNull();
    expect(deadlineTarget({ max_marks: 0 }, [mark(20, 25)])).toBeNull();
  });

  it("says nothing before there is a pace to hold", () => {
    // Every grade is still open; a target here would be arithmetic, not
    // advice.
    expect(deadlineTarget({ max_marks: 25 }, [])).toBeNull();
  });

  it("offers exactly the grade you're on and the one above", () => {
    // 20/25 is 80%, which is an A — A+ starts at 81, not 80.
    const t = deadlineTarget({ max_marks: 25 }, [mark(20, 25)])!;
    expect(t.current).toBe("A");
    expect(t.hold?.grade).toBe("A");
    expect(t.reach?.grade).toBe("A+");
  });

  it("has nothing above the top grade", () => {
    const t = deadlineTarget({ max_marks: 25 }, [mark(25, 25)])!;
    expect(t.current).toBe("O");
    expect(t.reach).toBeNull();
  });
});

describe("describeTarget", () => {
  it("leads with the improvement when it's reachable", () => {
    // On an A pace; A+ needs 0.81 * 50 - 20 = 20.5 of the 25 available.
    const t = deadlineTarget({ max_marks: 25 }, [mark(20, 25)])!;
    expect(describeTarget(t, 25)).toBe("20.5/25 for A+");
  });

  it("scales with the size of the test", () => {
    // Same 80% pace, a 50-mark test: 0.81 * 60 - 8 = 40.6 -> 41.
    const t = deadlineTarget({ max_marks: 50 }, [mark(8, 10)])!;
    expect(describeTarget(t, 50)).toBe("41/50 for A+");
  });

  it("says a grade is safe rather than demanding marks for it", () => {
    // A huge cushion and a tiny test: the pace grade holds at zero.
    const t = deadlineTarget({ max_marks: 2 }, [mark(45, 50)])!;
    expect(describeTarget(t, 2)).toMatch(/is safe$/);
  });

  it("speaks up on an F pace, where there is no grade to hold", () => {
    // targetsFor omits F — "what do I need to keep failing" isn't a
    // question — so this used to fall through and say nothing at all.
    const t = deadlineTarget({ max_marks: 5 }, [mark(2, 50)])!;
    expect(t.current).toBe("F");
    expect(t.hold).toBeNull();
    expect(describeTarget(t, 5)).toBe("C needs more than this test");
  });

  it("gives an F pace a real number when the test is big enough", () => {
    // 2/50 with a 100-mark test: C needs 0.5 * 150 - 2 = 73.
    const t = deadlineTarget({ max_marks: 100 }, [mark(2, 50)])!;
    expect(describeTarget(t, 100)).toBe("73/100 for C");
  });
});
