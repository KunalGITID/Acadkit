import { describe, expect, it } from "vitest";
import { skipAdviceFor } from "@/lib/skipAdvice";
import type { SubjectProjection } from "@/lib/projections";
import type { Subject, TimetableSlot } from "@/types";

function subject(id: string, code: string): Subject {
  return {
    id,
    device_id: "1234",
    code,
    name: code,
    credits: 4,
    type: "theory",
    faculty: null,
    color_hex: "#000",
  };
}

function slot(subject_id: string, start_time: string): TimetableSlot {
  return {
    id: `${subject_id}-${start_time}`,
    device_id: "1234",
    subject_id,
    day_order: 1,
    start_time,
    end_time: "10:00:00",
    room: null,
  };
}

/** Only the fields skipAdviceFor reads. */
function projection(
  id: string,
  code: string,
  opts: { skipBudget: number; attended: number; remaining: number; finalTotal: number }
): SubjectProjection {
  return {
    subject: subject(id, code),
    skipBudget: opts.skipBudget,
    attended: opts.attended,
    remaining: opts.remaining,
    finalTotal: opts.finalTotal,
  } as SubjectProjection;
}

const DSA = projection("dsa", "21CSC201J", {
  skipBudget: 2,
  attended: 30,
  remaining: 10,
  finalTotal: 50,
});
const OS = projection("os", "21CSC202J", {
  skipBudget: 0,
  attended: 20,
  remaining: 10,
  finalTotal: 40,
});

describe("skipAdviceFor", () => {
  it("says everything is safe when budgets allow", () => {
    const advice = skipAdviceFor("2026-09-04", 1, [slot("dsa", "09:00:00")], [DSA]);
    expect(advice.allSafe).toBe(true);
    expect(advice.classes[0].budgetAfter).toBe(1);
    expect(advice.headline).toBe("Safe to skip all 1 class.");
  });

  it("names the subject that can't afford it", () => {
    const advice = skipAdviceFor(
      "2026-09-04",
      1,
      [slot("dsa", "09:00:00"), slot("os", "11:00:00")],
      [DSA, OS]
    );
    expect(advice.allSafe).toBe(false);
    expect(advice.costly.map((s) => s.code)).toEqual(["21CSC202J"]);
    expect(advice.headline).toContain("21CSC202J");
  });

  it("spends budget cumulatively across repeats of one subject", () => {
    // Two DSA classes; budget is 2, so both are still affordable.
    const two = skipAdviceFor(
      "2026-09-04",
      1,
      [slot("dsa", "09:00:00"), slot("dsa", "11:00:00")],
      [DSA]
    );
    expect(two.classes.map((c) => c.budgetAfter)).toEqual([1, 0]);
    expect(two.allSafe).toBe(true);

    // Three exceeds it — the third is not safe.
    const three = skipAdviceFor(
      "2026-09-04",
      1,
      [slot("dsa", "09:00:00"), slot("dsa", "11:00:00"), slot("dsa", "14:00:00")],
      [DSA]
    );
    expect(three.classes.map((c) => c.safe)).toEqual([true, true, false]);
    expect(three.allSafe).toBe(false);
  });

  it("does not list the same subject twice as costly", () => {
    const advice = skipAdviceFor(
      "2026-09-04",
      1,
      [slot("os", "09:00:00"), slot("os", "11:00:00")],
      [OS]
    );
    expect(advice.costly).toHaveLength(1);
  });

  it("projects the percentage after missing the class", () => {
    const advice = skipAdviceFor("2026-09-04", 1, [slot("dsa", "09:00:00")], [DSA]);
    // 30 attended + 9 of 10 remaining, over 50 → 78%.
    expect(advice.classes[0].pctAfter).toBeCloseTo(78);
  });

  it("returns an empty verdict on a non-working day", () => {
    const advice = skipAdviceFor("2026-09-05", null, [slot("dsa", "09:00:00")], [DSA]);
    expect(advice.classes).toEqual([]);
    expect(advice.headline).toMatch(/no classes/i);
  });

  it("returns an empty verdict when the day order has no slots", () => {
    const advice = skipAdviceFor("2026-09-04", 3, [slot("dsa", "09:00:00")], [DSA]);
    expect(advice.classes).toEqual([]);
  });

  it("skips slots whose subject has no projection", () => {
    const advice = skipAdviceFor("2026-09-04", 1, [slot("ghost", "09:00:00")], [DSA]);
    expect(advice.classes).toEqual([]);
  });

  it("sorts the day chronologically", () => {
    const advice = skipAdviceFor(
      "2026-09-04",
      1,
      [slot("dsa", "14:00:00"), slot("dsa", "09:00:00")],
      [DSA]
    );
    expect(advice.classes.map((c) => c.slot.start_time)).toEqual([
      "09:00:00",
      "14:00:00",
    ]);
  });
});
