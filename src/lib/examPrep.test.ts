import { describe, expect, it } from "vitest";
import { prepForDeadline, prepId, rankedTopics, upcomingPrep, type PrepData, type PrepTest } from "@/lib/examPrep";

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

describe("prepForDeadline", () => {
  const DSA = { code: "21CSC201J" };

  it("finds the test for a deadline typed as FJ-2 at a different time", () => {
    const d = { title: "FJ-2", due_date: "2026-10-13T04:00:00.000Z" };
    expect(prepForDeadline(data([test({})]), d, DSA)?.title).toBe("DSA FJ-II");
  });

  it("with two tests that day, only the named one matches", () => {
    const two = data([test({ label: "FJ-II", title: "exam" }), test({ label: "LLJ-I", title: "lab" })]);
    expect(prepForDeadline(two, { title: "LLJ-1", due_date: "2026-10-13T08:00:00+05:30" }, DSA)?.title).toBe("lab");
    expect(prepForDeadline(two, { title: "21CSC201J Exam", due_date: "2026-10-13T08:00:00+05:30" }, DSA)).toBeNull();
  });

  it("with one test that day, a generic title still finds it", () => {
    expect(prepForDeadline(data([test({})]), { title: "21CSC201J Exam", due_date: "2026-10-13T09:00:00+05:30" }, DSA)).not.toBeNull();
  });

  it("needs the subject", () => {
    expect(prepForDeadline(data([test({})]), { title: "FJ-2", due_date: "2026-10-13T08:00:00+05:30" }, null)).toBeNull();
  });
});

describe("rankedTopics and prepId", () => {
  it("ranks by how often past papers asked, not raw counts", () => {
    const t = test({
      topics: [
        { topic: "BST", seen: 2, of: 5 },
        { topic: "AVL", seen: 3, of: 3 },
        { topic: "Heap", seen: 4, of: 5 },
      ],
    });
    expect(rankedTopics(t).map((x) => x.topic)).toEqual(["AVL", "Heap", "BST"]);
  });

  it("gives FJ-II and FJ-2 on the same day the same id", () => {
    expect(prepId(test({ label: "FJ-II" }))).toBe(prepId(test({ label: "FJ-2" })));
  });
});
