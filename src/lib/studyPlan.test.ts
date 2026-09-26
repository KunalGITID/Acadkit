import { describe, expect, it } from "vitest";
import { buildStudyPlan, gain, type PlanTest } from "@/lib/studyPlan";
import type { PrepWindow } from "@/lib/prep";

const window = (date: string, start: string, end: string): PrepWindow => ({
  date,
  dayOrder: 1,
  start,
  end,
  minutes: 0,
  afterSubjectId: "x",
  beforeSubjectId: "y",
});

const test = (over: Partial<PlanTest>): PlanTest => ({
  id: "t",
  subjectId: "s",
  label: "OS · FT-2",
  due: "2026-10-05T09:00:00",
  stake: 15,
  ability: 0.6,
  credits: 4,
  ...over,
});

describe("gain", () => {
  it("has diminishing returns and never exceeds the gap to full marks", () => {
    const t = { stake: 15, ability: 0.6 };
    const first = gain(t, 1) - gain(t, 0);
    const later = gain(t, 5) - gain(t, 4);
    expect(first).toBeGreaterThan(later);
    expect(gain(t, 1000)).toBeCloseTo(15 * 0.4, 6);
  });

  it("buys nothing where you'd score full marks anyway", () => {
    expect(gain({ stake: 15, ability: 1 }, 3)).toBe(0);
  });
});

describe("buildStudyPlan", () => {
  it("only uses time before each test", () => {
    const plan = buildStudyPlan({
      tests: [test({ due: "2026-10-02T09:00:00" })],
      windows: [window("2026-10-01", "10:00", "11:00"), window("2026-10-03", "10:00", "11:00")],
      eveningMinutes: 0,
      today: "2026-09-30",
      nowMinutes: 0,
    });
    expect(plan.sessions.every((s) => s.date < "2026-10-02")).toBe(true);
    expect(plan.totalMinutes).toBe(60);
  });

  it("merges back-to-back blocks into one session", () => {
    const plan = buildStudyPlan({
      tests: [test({})],
      windows: [window("2026-10-01", "10:00", "11:30")],
      eveningMinutes: 0,
      today: "2026-09-30",
      nowMinutes: 0,
    });
    expect(plan.sessions).toEqual([
      { testId: "t", date: "2026-10-01", start: "10:00", end: "11:30", minutes: 90, evening: false },
    ]);
  });

  it("uses evening time only when allowed", () => {
    const base = {
      tests: [test({ due: "2026-10-03T09:00:00" })],
      windows: [],
      today: "2026-10-01",
      nowMinutes: 0,
    };
    expect(buildStudyPlan({ ...base, eveningMinutes: 0 }).sessions).toEqual([]);
    const evenings = buildStudyPlan({ ...base, eveningMinutes: 60 });
    expect(evenings.sessions.map((s) => [s.date, s.start, s.end, s.evening])).toEqual([
      ["2026-10-01", "18:30", "19:30", true],
      ["2026-10-02", "18:30", "19:30", true],
    ]);
  });

  it("spends the most on what's worth most, and something on the rest", () => {
    const big = test({ id: "big", stake: 20, ability: 0.4, credits: 4 });
    const small = test({ id: "small", stake: 5, ability: 0.8, credits: 2 });
    const plan = buildStudyPlan({
      tests: [big, small],
      windows: ["2026-10-01", "2026-10-02", "2026-10-03"].map((d) => window(d, "10:00", "12:00")),
      eveningMinutes: 0,
      today: "2026-09-30",
      nowMinutes: 0,
    });
    const minutes = Object.fromEntries(plan.perTest.map((x) => [x.test.id, x.minutes]));
    expect(minutes.big).toBeGreaterThan(minutes.small ?? 0);
    expect(plan.totalMinutes).toBeLessThanOrEqual(6 * 60);
  });

  it("leaves early blocks for the test that comes first", () => {
    const early = test({ id: "early", due: "2026-10-02T09:00:00" });
    const late = test({ id: "late", due: "2026-10-06T09:00:00" });
    const plan = buildStudyPlan({
      tests: [late, early],
      windows: [window("2026-10-01", "10:00", "11:00"), window("2026-10-05", "10:00", "11:00")],
      eveningMinutes: 0,
      today: "2026-09-30",
      nowMinutes: 0,
    });
    const byTest = Object.fromEntries(plan.sessions.map((s) => [s.testId, s.date]));
    expect(byTest.early).toBe("2026-10-01");
    expect(byTest.late).toBe("2026-10-05");
  });

  it("skips time already past today", () => {
    const plan = buildStudyPlan({
      tests: [test({})],
      windows: [window("2026-09-30", "10:00", "11:00"), window("2026-10-01", "10:00", "11:00")],
      eveningMinutes: 0,
      today: "2026-09-30",
      nowMinutes: 12 * 60,
    });
    expect(plan.sessions.map((s) => s.date)).toEqual(["2026-10-01"]);
  });

  it("plans nothing with no tests ahead", () => {
    const plan = buildStudyPlan({ tests: [], windows: [], eveningMinutes: 120, today: "2026-09-30", nowMinutes: 0 });
    expect(plan).toEqual({ sessions: [], perTest: [], totalMinutes: 0 });
  });
});
