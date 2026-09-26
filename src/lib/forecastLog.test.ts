import { describe, expect, it } from "vitest";
import { forecastRows, weekStart } from "@/lib/forecastLog";
import { ODDS_MODEL, type SemesterOdds } from "@/lib/odds";

describe("weekStart", () => {
  it("is the Monday of the week", () => {
    expect(weekStart("2026-09-26")).toBe("2026-09-21"); // Saturday
    expect(weekStart("2026-09-27")).toBe("2026-09-21"); // Sunday belongs to the week before
    expect(weekStart("2026-09-28")).toBe("2026-09-28"); // Monday is its own
  });
});

describe("forecastRows", () => {
  const odds: SemesterOdds = {
    subjects: [
      {
        subjectId: "s1",
        target: "A",
        distribution: { O: 0.1, "A+": 0.2, A: 0.3333333, "B+": 0.2, B: 0.1, C: 0.05, F: 0.0166667 },
        pTarget: 0.6333333,
        pPass: 0.9833333,
        median: 74.123,
        p10: 61.5,
        p90: 85.25,
        ability: 0.72,
        evidence: 3,
        final: false,
        barred: false,
      },
    ],
    sgpa: { target: 8.5, pTarget: 0.412, median: 8.25, p10: 7.5, p90: 8.9 },
  };

  it("logs every subject and the semester, tagged with the model", () => {
    const rows = forecastRows("0404", "2026-09-21", odds);
    expect(rows.map((r) => r.scope)).toEqual(["s1", "sgpa"]);
    expect(rows.every((r) => r.model === ODDS_MODEL && r.week_start === "2026-09-21")).toBe(true);
    expect(rows[0]).toMatchObject({ target: "A", p_target: 0.6333, evidence: 3, median: 74.12 });
    expect(rows[0].distribution!.A).toBe(0.3333);
    expect(rows[1]).toMatchObject({ target: "8.5", p_target: 0.412, evidence: 3, distribution: null });
  });

  it("skips the semester row when nothing carries credits", () => {
    expect(forecastRows("0404", "2026-09-21", { ...odds, sgpa: null })).toHaveLength(1);
  });
});
