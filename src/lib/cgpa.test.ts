import { describe, expect, it } from "vitest";
import { cgpaLadder, completedRecord, sgpaNeededFor } from "@/lib/cgpa";
import type { SemesterArchive } from "@/types";

const sem = (sgpa: number | null, credits: number | null): SemesterArchive => ({
  id: Math.random().toString(36),
  device_id: "p",
  label: "sem",
  sgpa,
  credits,
  summary: [],
  sem_start: null,
  sem_end: null,
});

describe("completedRecord", () => {
  it("weights by credits, not by semester", () => {
    // 8.0 over 20 credits and 9.0 over 10 is 8.33, not 8.5.
    const r = completedRecord([sem(8, 20), sem(9, 10)]);
    expect(r.credits).toBe(30);
    expect(r.cgpa).toBeCloseTo(8.3333, 3);
    expect(r.semesters).toBe(2);
  });

  it("ignores archives with no grade or no credits", () => {
    const r = completedRecord([sem(8, 20), sem(null, 10), sem(9, 0)]);
    expect(r.credits).toBe(20);
    expect(r.semesters).toBe(1);
  });

  it("has no CGPA before the first semester is archived", () => {
    expect(completedRecord([]).cgpa).toBeNull();
  });
});

describe("sgpaNeededFor", () => {
  const completed = completedRecord([sem(8, 20)]);

  it("solves for the semester that lands exactly on target", () => {
    const v = sgpaNeededFor(8.5, completed, 20)!;
    expect(v.kind).toBe("reachable");
    // (8.5 × 40 − 160) / 20 = 9
    expect(v.needed).toBeCloseTo(9);
  });

  /** The answer has to survive being fed back in. */
  it("round-trips: scoring the required SGPA produces the target", () => {
    const v = sgpaNeededFor(8.7, completed, 22)!;
    const cgpa = (completed.points + v.needed * 22) / (completed.credits + 22);
    expect(cgpa).toBeCloseTo(8.7);
  });

  /**
   * "Secured" is a strong claim: it means scoring zero this semester
   * still clears the target. With 8.0 over 20 credits and 20 more
   * enrolled, that holds only up to 4.0 — a target of 6 still needs a
   * 4.0 this semester, because a bad enough term drops you under it.
   */
  it("says so only when even a zero this semester still clears it", () => {
    expect(sgpaNeededFor(3.5, completed, 20)!.kind).toBe("secured");
    expect(sgpaNeededFor(4, completed, 20)!.kind).toBe("secured");
    expect(sgpaNeededFor(6, completed, 20)!.kind).toBe("reachable");
    expect(sgpaNeededFor(6, completed, 20)!.needed).toBeCloseTo(4);
  });

  it("says so when even a perfect semester falls short", () => {
    const v = sgpaNeededFor(9.6, completed, 20)!;
    expect(v.kind).toBe("impossible");
    if (v.kind === "impossible") expect(v.shortfall).toBeGreaterThan(0);
  });

  /**
   * With nothing enrolled there is no unknown to solve for, and both 0
   * and Infinity would be read as answers.
   */
  it("declines to answer with no credits this semester", () => {
    expect(sgpaNeededFor(8.5, completed, 0)).toBeNull();
  });

  it("works from a standing start, before anything is archived", () => {
    const v = sgpaNeededFor(9, completedRecord([]), 20)!;
    expect(v.kind).toBe("reachable");
    expect(v.needed).toBeCloseTo(9);
  });
});

describe("cgpaLadder", () => {
  it("returns a rung per target, hardest last", () => {
    const rungs = cgpaLadder(completedRecord([sem(8, 20)]), 20);
    expect(rungs).toHaveLength(5);
    expect(rungs[0].target).toBeLessThan(rungs[4].target);
    const needs = rungs.map((r) => r.verdict.needed);
    expect(needs[0]).toBeLessThan(needs[4]);
  });

  it("is empty when there is nothing to solve for", () => {
    expect(cgpaLadder(completedRecord([]), 0)).toEqual([]);
  });
});
