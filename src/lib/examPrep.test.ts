import { describe, expect, it } from "vitest";
import { prepId, upcomingPrep, type PrepData, type PrepTest } from "@/lib/examPrep";

const test = (p: Partial<PrepTest>): PrepTest => ({
  subject_code: "21CSC201J",
  label: "FJ-II",
  due_date: "2026-10-13T08:00:00+05:30",
  title: "DSA FJ-II",
  topics: [],
  files: [],
  ...p,
});
const data = (tests: PrepTest[]): PrepData => ({ version: 1, generatedAt: 0, tests });
const NOW = new Date("2026-10-13T15:00:00+05:30").getTime();

describe("upcomingPrep", () => {
  it("keeps today's test for the rest of the day, drops yesterday's, soonest first", () => {
    const list = upcomingPrep(
      data([
        test({ label: "later", due_date: "2026-11-12T08:00:00+05:30" }),
        test({ label: "today" }),
        test({ label: "gone", due_date: "2026-10-12T08:00:00+05:30" }),
      ]),
      NOW
    );
    expect(list.map((t) => t.label)).toEqual(["today", "later"]);
  });
});

describe("prepId", () => {
  it("gives FJ-II and FJ-2 on the same day the same id", () => {
    expect(prepId(test({ label: "FJ-II" }))).toBe(prepId(test({ label: "FJ-2" })));
  });
});
