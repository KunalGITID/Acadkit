import { describe, expect, it } from "vitest";
import { bestReachable, floorGrade, marksNeeded, targetsFor } from "@/lib/targets";

/** 20/25 so far — 80%, an A+ pace. */
const CURRENT = { internalObtained: 20, internalMax: 25 };

describe("marksNeeded", () => {
  it("accounts for the component growing the denominator", () => {
    // 20/25, next test worth 25. For 80% overall: 0.8 * 50 - 20 = 20.
    expect(marksNeeded(20, 25, 25, 80)).toBe(20);
  });

  it("goes negative when the grade is already banked", () => {
    // 20/25 with a 25-mark test, targeting 50%: 0.5 * 50 - 20 = 5.
    expect(marksNeeded(20, 25, 25, 50)).toBe(5);
    // Targeting 30%: 0.3 * 50 - 20 = -5 — score zero and still clear it.
    expect(marksNeeded(20, 25, 25, 30)).toBe(-5);
  });

  it("handles a first-ever component", () => {
    // Nothing recorded; a 50-mark test alone must carry the grade.
    expect(marksNeeded(0, 0, 50, 71)).toBeCloseTo(35.5);
  });
});

describe("targetsFor", () => {
  const targets = targetsFor(CURRENT, 25);

  it("returns every passing grade, best first", () => {
    expect(targets.map((t) => t.grade)).toEqual(["O", "A+", "A", "B+", "B", "C"]);
  });

  it("rounds required marks up to the next half", () => {
    // O needs 0.91 * 50 - 20 = 25.5 — more than the test is worth.
    const o = targets.find((t) => t.grade === "O")!;
    expect(o.required).toBe(25.5);
    expect(o.achievable).toBe(false);
  });

  it("marks a grade achievable when full marks reach it", () => {
    const aPlus = targets.find((t) => t.grade === "A+")!;
    expect(aPlus.required).toBe(20.5); // 0.81 * 50 - 20 = 20.5
    expect(aPlus.achievable).toBe(true);
  });

  it("flags grades that hold even at zero", () => {
    // C needs 0.5 * 50 - 20 = 5, so not secured.
    expect(targets.find((t) => t.grade === "C")!.secured).toBe(false);
    // With a big cushion, C is banked.
    const rich = targetsFor({ internalObtained: 45, internalMax: 50 }, 10);
    expect(rich.find((t) => t.grade === "C")!.secured).toBe(true);
    expect(rich.find((t) => t.grade === "C")!.required).toBe(0);
  });

  it("returns nothing to solve when the component is worth zero", () => {
    expect(targetsFor(CURRENT, 0)).toEqual([]);
  });

  it("never reports a negative requirement", () => {
    for (const t of targetsFor({ internalObtained: 60, internalMax: 60 }, 20)) {
      expect(t.required).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("bestReachable / floorGrade", () => {
  it("finds the ceiling and the floor", () => {
    const targets = targetsFor(CURRENT, 25);
    expect(bestReachable(targets)?.grade).toBe("A+");
    expect(floorGrade(targets)).toBeNull(); // nothing banked yet
  });

  it("reports the floor once a grade is safe", () => {
    const targets = targetsFor({ internalObtained: 48, internalMax: 50 }, 10);
    expect(floorGrade(targets)?.grade).toBe("A");
    expect(bestReachable(targets)?.grade).toBe("O");
  });

  it("returns null when even a C is out of reach", () => {
    // 2/50 with a 5-mark test left: 0.5 * 55 - 2 = 25.5, way over 5.
    const targets = targetsFor({ internalObtained: 2, internalMax: 50 }, 5);
    expect(bestReachable(targets)).toBeNull();
  });
});
