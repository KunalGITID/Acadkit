import { describe, expect, it } from "vitest";
import { countMatches, findAll, normalise, stepMatch } from "./textSearch";

describe("findAll", () => {
  it("ignores case and returns positions in the original text", () => {
    const t = "Deadlock: a DEADLOCK needs four conditions.";
    expect(findAll(t, "deadlock")).toEqual([
      { start: 0, end: 8 },
      { start: 12, end: 20 },
    ]);
  });

  it("finds a sentence across line breaks and runs of spaces", () => {
    const t = "Round\n   Robin scheduling";
    const [m] = findAll(t, "round robin");
    expect(t.slice(m.start, m.end)).toBe("Round\n   Robin");
  });

  it("matches curly quotes and dashes by their plain forms", () => {
    expect(countMatches("Banker’s algorithm – safe state", "banker's algorithm - safe")).toBe(1);
  });

  it("does not overlap matches", () => {
    expect(countMatches("aaaa", "aa")).toBe(2);
  });

  it("finds nothing for an empty or blank query", () => {
    expect(findAll("anything", "")).toEqual([]);
    expect(findAll("anything", "   ")).toEqual([]);
  });

  it("stops at the limit", () => {
    expect(findAll("x ".repeat(100), "x", 10)).toHaveLength(10);
  });
});

describe("normalise", () => {
  it("collapses and trims whitespace, mapping back to the source", () => {
    const { norm, map } = normalise("  A \n b ");
    expect(norm).toBe("a b");
    expect(map).toEqual([2, 3, 6]);
  });
});

describe("stepMatch", () => {
  it("wraps both ways and starts from either end", () => {
    expect(stepMatch(-1, 3, 1)).toBe(0);
    expect(stepMatch(-1, 3, -1)).toBe(2);
    expect(stepMatch(2, 3, 1)).toBe(0);
    expect(stepMatch(0, 3, -1)).toBe(2);
    expect(stepMatch(0, 0, 1)).toBe(-1);
  });
});
