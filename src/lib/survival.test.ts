import { describe, expect, it } from "vitest";
import { buildSurvivalPlan, classesNeeded, type SubjectState } from "@/lib/survival";
import type { Subject, TimetableSlot } from "@/types";

function subject(id: string, code = id.toUpperCase()): Subject {
  return {
    id,
    device_id: "0404",
    code,
    name: code,
    credits: 4,
    type: "theory",
    faculty: null,
    color_hex: "#000",
  };
}

function slot(subject_id: string, day_order: number, start_time = "09:00:00"): TimetableSlot {
  return {
    id: `${subject_id}-${day_order}-${start_time}`,
    device_id: "0404",
    subject_id,
    day_order,
    start_time,
    end_time: "09:50:00",
    room: null,
  };
}

/** Ten working days, day orders cycling 1–5 twice. */
const EFF_MAP: Record<string, number> = {};
["01", "02", "03", "04", "05", "08", "09", "10", "11", "12"].forEach((d, i) => {
  EFF_MAP[`2026-09-${d}`] = (i % 5) + 1;
});

const state = (id: string, attended: number, held: number): SubjectState => ({
  subject: subject(id),
  attended,
  held,
});

describe("classesNeeded", () => {
  it("rounds up — you can't attend a fraction of a class", () => {
    // 0.75 * (10 + 10) = 15, minus 8 attended = 7.
    expect(classesNeeded(8, 10, 10)).toBe(7);
    // 0.75 * (10 + 9) = 14.25, minus 8 = 6.25 -> 7.
    expect(classesNeeded(8, 10, 9)).toBe(7);
  });

  it("is zero when you're already clear", () => {
    expect(classesNeeded(20, 20, 4)).toBe(0);
  });

  it("never returns a negative", () => {
    expect(classesNeeded(100, 10, 2)).toBe(0);
  });
});

describe("buildSurvivalPlan", () => {
  it("spends slack on the earliest classes, so a date falls out", () => {
    // 9/10 held, 2 future classes (day order 1 falls twice). Needs
    // ceil(0.75*12 - 9) = 0, so both are skippable.
    const plan = buildSurvivalPlan(
      [state("dsa", 9, 10)],
      [slot("dsa", 1)],
      EFF_MAP,
      "2026-09-01"
    );
    const o = plan.subjects[0];
    expect(o.remaining).toBe(2);
    expect(o.slack).toBe(2);
    expect(o.lastSkippable).toBe("2026-09-08"); // the later of the two
    expect(plan.days.every((d) => d.free)).toBe(true);
  });

  it("marks classes required once slack runs out, in date order", () => {
    // 0/2 held, 2 future. Needs ceil(0.75*4) = 3 > 2 remaining, so this
    // one is unreachable — covered separately. Use a solvable case:
    // 6/8 held, 2 future -> needs ceil(0.75*10 - 6) = 2, slack 0.
    const plan = buildSurvivalPlan(
      [state("dsa", 6, 8)],
      [slot("dsa", 1)],
      EFF_MAP,
      "2026-09-01"
    );
    expect(plan.subjects[0].slack).toBe(0);
    expect(plan.subjects[0].lastSkippable).toBeNull();
    expect(plan.days.every((d) => d.requiredCount === 1)).toBe(true);
    expect(plan.firstRequiredDate).toBe("2026-09-01");
  });

  it("leaves an unreachable subject entirely optional", () => {
    // 0 attended of 30 held, 2 classes left. Nothing saves it, so
    // nothing about it should be marked mandatory.
    const plan = buildSurvivalPlan(
      [state("os", 0, 30)],
      [slot("os", 1)],
      EFF_MAP,
      "2026-09-01"
    );
    const o = plan.subjects[0];
    expect(o.reachable).toBe(false);
    expect(o.lastSkippable).toBeNull();
    expect(plan.lost.map((s) => s.id)).toEqual(["os"]);
    expect(plan.days.every((d) => d.free)).toBe(true);
  });

  it("a day is free only when every class in it is optional", () => {
    // dsa has slack, os does not — they share day order 1.
    const plan = buildSurvivalPlan(
      [state("dsa", 10, 10), state("os", 6, 8)],
      [slot("dsa", 1, "09:00:00"), slot("os", 1, "11:00:00")],
      EFF_MAP,
      "2026-09-01"
    );
    const day = plan.days[0];
    expect(day.classes).toHaveLength(2);
    expect(day.free).toBe(false);
    expect(day.requiredCount).toBe(1);
    expect(day.classes.find((c) => c.subject.id === "dsa")!.required).toBe(false);
    expect(day.classes.find((c) => c.subject.id === "os")!.required).toBe(true);
  });

  it("reports the ceiling when everything left is attended", () => {
    const plan = buildSurvivalPlan(
      [state("os", 0, 30)],
      [slot("os", 1)],
      EFF_MAP,
      "2026-09-01"
    );
    // (0 + 2) / (30 + 2) = 6.25%
    expect(plan.subjects[0].ceiling).toBeCloseTo(6.25);
  });

  it("ignores days before `from`", () => {
    const plan = buildSurvivalPlan(
      [state("dsa", 0, 0)],
      [slot("dsa", 1)],
      EFF_MAP,
      "2026-09-08"
    );
    expect(plan.days.map((d) => d.date)).toEqual(["2026-09-08"]);
  });

  it("skips days whose day order has no classes", () => {
    const plan = buildSurvivalPlan(
      [state("dsa", 0, 0)],
      [slot("dsa", 3)],
      EFF_MAP,
      "2026-09-01"
    );
    // Day order 3 falls on the 3rd and the 10th only.
    expect(plan.days.map((d) => d.date)).toEqual(["2026-09-03", "2026-09-10"]);
  });

  it("handles a subject with no future classes at all", () => {
    const plan = buildSurvivalPlan(
      [state("ghost", 5, 10)],
      [],
      EFF_MAP,
      "2026-09-01"
    );
    const o = plan.subjects[0];
    expect(o.remaining).toBe(0);
    expect(o.reachable).toBe(false); // 5/10 with nothing left can't reach 75%
    expect(plan.days).toEqual([]);
    expect(plan.firstRequiredDate).toBeNull();
  });

  it("gives free days only where they exist", () => {
    const plan = buildSurvivalPlan(
      [state("dsa", 10, 10), state("os", 6, 8)],
      [slot("dsa", 2), slot("os", 1)],
      EFF_MAP,
      "2026-09-01"
    );
    // Day order 2 days carry only dsa, which has slack -> free.
    expect(plan.freeDays.length).toBeGreaterThan(0);
    for (const d of plan.freeDays) {
      expect(plan.days.find((x) => x.date === d)!.requiredCount).toBe(0);
    }
  });
});
