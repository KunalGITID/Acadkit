import { describe, expect, it } from "vitest";
import { groupKeys, prepId, topicsForTest, upcomingPrep, type PrepData, type PrepTest, type TopicsData } from "@/lib/examPrep";

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

describe("topicsForTest", () => {
  const data: TopicsData = {
    version: 1,
    generatedAt: 0,
    model: "gte-small",
    subjects: [
      {
        subject_code: "21CSC202J",
        papers: 9,
        questions: 80,
        groups: { End_Sem: 7, "FT-I_&_FT-II_mixed": 2 },
        topics: [
          { label: "bankers algorithm · safe state", example: "", papers: 5, questions: 6, latest: 2025, groups: { End_Sem: 5 } },
          { label: "page replacement · lru", example: "", papers: 4, questions: 5, latest: 2024, groups: { End_Sem: 3, "FT-I_&_FT-II_mixed": 1 } },
          { label: "process states", example: "", papers: 2, questions: 2, latest: 2023, groups: { "FT-I_&_FT-II_mixed": 2 } },
        ],
      },
    ],
  };

  it("counts over the test's own papers when there are any", () => {
    const r = topicsForTest(data, { subject_code: "21CSC202J", label: "FJ-II" })!;
    expect(r.scope).toBe("test");
    expect(r.papers).toBe(2);
    expect(r.topics.map((t) => [t.label, t.count])).toEqual([
      ["process states", 2],
      ["page replacement · lru", 1],
    ]);
  });

  it("reads the end-sem as the End_Sem folder", () => {
    const r = topicsForTest(data, { subject_code: "21CSC202J", label: "End semester" })!;
    expect(r.scope).toBe("test");
    expect(r.papers).toBe(7);
    expect(r.topics[0].label).toBe("bankers algorithm · safe state");
  });

  it("falls back to the whole subject for a test with no papers of its own", () => {
    const r = topicsForTest(data, { subject_code: "21CSC202J", label: "LLJ-I" })!;
    expect(r.scope).toBe("subject");
    expect(r.papers).toBe(9);
    expect(r.topics[0].count).toBe(5);
  });

  it("has nothing for a subject without mined topics", () => {
    expect(topicsForTest(data, { subject_code: "21MAB201T", label: "FT-III" })).toBeNull();
  });

  it("splits a mixed folder into the tests it holds", () => {
    expect(groupKeys("FT-I_&_FT-II_mixed")).toEqual(["f1", "f2"]);
    expect(groupKeys("End_Sem")).toEqual(["endsem"]);
  });
});
