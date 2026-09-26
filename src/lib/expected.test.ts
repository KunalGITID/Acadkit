import { describe, expect, it } from "vitest";
import { expectedFor, expectedOutlook, expectedSgpa, setExpected } from "@/lib/expected";
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

  it("never adopts T-EXT — that's the end-sem, already the external weight", () => {
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

describe("expectedSgpa", () => {
  it("moves only when something is expected", () => {
    const marks = new Map([["os", ft1]]);
    const none = expectedSgpa([base], marks);
    expect(none.expected).toBe(none.now);
    const some = expectedSgpa([expecting(15)], marks);
    expect(some.pending).toBe(1);
    expect(some.expected!).toBeGreaterThan(some.now!);
  });
});
