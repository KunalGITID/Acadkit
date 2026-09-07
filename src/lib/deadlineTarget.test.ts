import { describe, expect, it } from "vitest";
import { deadlineNeed, describeNeed } from "@/lib/deadlineTarget";
import type { Assessment, Deadline, Grade, Mark, Subject } from "@/types";

/**
 * These read off the subject's budget rather than recomputing anything,
 * so what they really pin is that a deadline row and the subject's
 * Insights card give the same answer — and that the answer is for the
 * grade you chose, not the one your current pace implies.
 */

const sub = (over: Partial<Subject> = {}, assessment?: Assessment): Subject => ({
  id: "s1",
  device_id: "0404",
  code: "X",
  name: "X",
  credits: 4,
  type: "theory",
  faculty: null,
  color_hex: "#000",
  assessment: assessment ?? { internal: 60, complete: false, components: [] },
  ...over,
});

const dl = (title: string, max: number | null, id = "d1"): Deadline => ({
  id,
  device_id: "0404",
  subject_id: "s1",
  title,
  type: "exam",
  due_date: "2026-10-12T09:00:00.000Z",
  status: "pending",
  priority: "medium",
  max_marks: max,
});

const mark = (label: string, obtained: number, max: number): Mark => ({
  id: `${label}`,
  device_id: "0404",
  subject_id: "s1",
  component_type: "CT",
  label,
  marks_obtained: obtained,
  max_marks: max,
  is_external: false,
});

describe("deadlineNeed", () => {
  it("says nothing when the test carries no marks", () => {
    // A lab record with no denominator has no target to compute.
    expect(deadlineNeed(dl("CT-1", null), sub(), [], { deadlines: [dl("CT-1", null)] })).toBeNull();
    expect(deadlineNeed(dl("CT-1", 0), sub(), [], { deadlines: [dl("CT-1", 0)] })).toBeNull();
  });

  it("answers before a single mark exists", () => {
    // The old version refused until there was a pace to hold, so a test
    // in week two — exactly when knowing the number is most useful —
    // showed nothing at all.
    const d = dl("CT-1", 15);
    const need = deadlineNeed(d, sub({ target_grade: "A" }), [], { deadlines: [d] })!;
    expect(need.grade).toBe("A");
    expect(need.required).toBe(11); // 71% of 15 is 10.65, and 10.5 is not enough
    expect(need.reachable).toBe(true);
  });

  it("asks for the grade you chose, not the one you're tracking", () => {
    const d = dl("CT-1", 15);
    const marks = [mark("Assignment", 1, 20)]; // an F pace
    const aiming = deadlineNeed(d, sub({ target_grade: "A+" }), marks, { deadlines: [d] })!;
    expect(aiming.grade).toBe("A+");
    // 81 − 1 banked, spread over the 79 remaining marks, times 15.
    expect(aiming.required).toBe(15);
  });

  it("falls back to the semester target when the subject has no view", () => {
    const d = dl("CT-1", 15);
    expect(deadlineNeed(d, sub(), [], { deadlines: [d], targetSgpa: 9 })!.grade).toBe("A+");
    expect(deadlineNeed(d, sub(), [], { deadlines: [d], targetSgpa: 6 })!.grade).toBe("B");
  });

  it("reads the number off a component the plan already declares", () => {
    // Named the same as a planned component, so it dates that one rather
    // than becoming a second — and the number is that component's.
    const planned: Assessment = {
      internal: 60,
      complete: false,
      components: [{ key: "c1", label: "CT-1", type: "CT", max: 15 }],
    };
    const d = dl("CT-1", 15);
    const need = deadlineNeed(d, sub({ target_grade: "A" }, planned), [], { deadlines: [d] })!;
    expect(need.max).toBe(15);
    expect(need.required).toBe(11);
  });

  it("follows the end-sem assumption, like the card does", () => {
    const d = dl("CT-1", 15);
    const even = deadlineNeed(d, sub({ target_grade: "A" }), [], { deadlines: [d] })!;
    const assumed = deadlineNeed(d, sub({ target_grade: "A" }), [], {
      deadlines: [d],
      assumedExternalPct: 90,
    })!;
    // Expecting a good exam moves the ask down, not up.
    expect(assumed.required).toBeLessThan(even.required);
  });

  it("goes quiet once the mark is in", () => {
    const d = dl("CT-1", 15);
    expect(
      deadlineNeed(d, sub({ target_grade: "A" }), [mark("CT-1", 12, 15)], { deadlines: [d] })
    ).toBeNull();
  });

  it("admits when the test cannot carry the target on its own", () => {
    const d = dl("CT-1", 5);
    const need = deadlineNeed(d, sub({ target_grade: "O" }), [mark("Assignment", 0, 55)], {
      deadlines: [d],
    })!;
    expect(need.reachable).toBe(false);
  });
});

describe("describeNeed", () => {
  const need = (over: Partial<ReturnType<typeof deadlineNeed>> = {}) =>
    ({
      required: 10.5,
      max: 15,
      grade: "A" as Grade,
      reachable: true,
      secured: false,
      ...over,
    }) as NonNullable<ReturnType<typeof deadlineNeed>>;

  it("puts the marks in front of the grade", () => {
    expect(describeNeed(need())).toBe("10.5/15 for A");
  });

  it("says a grade is safe rather than demanding nothing for it", () => {
    expect(describeNeed(need({ secured: true, required: 0 }))).toBe("A is safe");
  });

  it("says so when one test cannot get there", () => {
    expect(describeNeed(need({ reachable: false }))).toBe("A needs more than this test");
  });
});
