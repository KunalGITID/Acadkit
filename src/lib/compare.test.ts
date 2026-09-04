import { describe, expect, it } from "vitest";
import {
  buildSharedCard,
  compareCards,
  makeShareCode,
  normaliseShareCode,
  type SharedCard,
} from "@/lib/compare";
import type { SubjectAttendance } from "@/lib/attendance";
import type { Subject } from "@/types";

const stat = (name: string, attended: number, total: number): SubjectAttendance =>
  ({
    subject: { id: name, name, color_hex: "#abc" } as Subject,
    attended,
    total,
    percentage: total ? (attended / total) * 100 : null,
    canBunk: 0,
    needToAttend: 0,
    source: "manual",
  }) as SubjectAttendance;

const card = (over: Partial<SharedCard> = {}): SharedCard => ({
  name: null,
  overall: 80,
  subjects: [],
  v: 1,
  ...over,
});

describe("buildSharedCard", () => {
  it("carries attendance and nothing else", () => {
    // The omissions are the feature. If this object ever grows a marks
    // or email field, that is a privacy change, not a refactor.
    const c = buildSharedCard("Kunal", 82.35, [stat("OS", 20, 24)]);
    expect(Object.keys(c).sort()).toEqual(["name", "overall", "subjects", "v"]);
    expect(Object.keys(c.subjects[0]).sort()).toEqual(["color", "name", "percentage"]);
  });

  it("rounds percentages", () => {
    // 82.3529% would let someone reconstruct exactly how many classes
    // you have sat, which is not what was agreed to.
    const c = buildSharedCard(null, 82.3529, [stat("OS", 20, 24)]);
    expect(c.overall).toBe(82);
    expect(c.subjects[0].percentage).toBe(83);
  });

  it("omits subjects with nothing marked", () => {
    const c = buildSharedCard(null, 80, [stat("OS", 20, 24), stat("New", 0, 0)]);
    expect(c.subjects.map((s) => s.name)).toEqual(["OS"]);
  });

  it("treats a blank name as no name", () => {
    expect(buildSharedCard("   ", 80, []).name).toBeNull();
    expect(buildSharedCard(null, 80, []).name).toBeNull();
  });

  it("survives an account with nothing marked at all", () => {
    const c = buildSharedCard("Kunal", null, []);
    expect(c.overall).toBeNull();
    expect(c.subjects).toEqual([]);
  });
});

describe("makeShareCode", () => {
  it("is long enough not to be guessed", () => {
    expect(makeShareCode()).toHaveLength(10);
  });

  it("avoids characters that get misread aloud", () => {
    // No 0/O/1/I/L — codes get read down a phone.
    for (let i = 0; i < 40; i++) expect(makeShareCode()).not.toMatch(/[01OIL]/);
  });

  it("does not repeat itself", () => {
    const seen = new Set(Array.from({ length: 300 }, makeShareCode));
    expect(seen.size).toBe(300);
  });
});

describe("normaliseShareCode", () => {
  it("accepts what people actually type", () => {
    expect(normaliseShareCode(" k7m-2p x9 ")).toBe("K7M2PX9");
  });
});

describe("compareCards", () => {
  it("lines subjects up across two accounts", () => {
    const mine = card({ subjects: [{ name: "OS", color: "#f00", percentage: 90 }] });
    const theirs = card({ subjects: [{ name: "OS", color: "#00f", percentage: 70 }] });
    expect(compareCards(mine, theirs).rows).toEqual([
      { name: "OS", color: "#f00", mine: 90, theirs: 70 },
    ]);
  });

  it("matches names that differ only in case or spacing", () => {
    const mine = card({ subjects: [{ name: "Operating  Systems", color: "#f00", percentage: 90 }] });
    const theirs = card({ subjects: [{ name: "operating systems", color: "#00f", percentage: 70 }] });
    const rows = compareCards(mine, theirs).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].theirs).toBe(70);
  });

  it("keeps a subject only one of you takes", () => {
    // "You don't even take this one" is part of the comparison, and
    // dropping the row would make the totals disagree with the list.
    const mine = card({ subjects: [{ name: "OS", color: "#f00", percentage: 90 }] });
    const theirs = card({ subjects: [{ name: "Maths", color: "#00f", percentage: 60 }] });
    const rows = compareCards(mine, theirs).rows;
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.name === "Maths")).toMatchObject({ mine: null, theirs: 60 });
    expect(rows.find((r) => r.name === "OS")).toMatchObject({ mine: 90, theirs: null });
  });

  it("carries both overalls through", () => {
    const c = compareCards(card({ overall: 88 }), card({ overall: 61 }));
    expect(c.overall).toEqual({ mine: 88, theirs: 61 });
  });
});
