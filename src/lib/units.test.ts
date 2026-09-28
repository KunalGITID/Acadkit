import { describe, expect, it } from "vitest";
import { paperShares, unitProgress, unitsInPortion, type CourseUnits } from "./units";

describe("unitsInPortion", () => {
  it.each([
    ["Unit III: classification of 2nd-order PDEs", [3]],
    ["Units 1-3", [1, 2, 3]],
    ["Unit I – III", [1, 2, 3]],
    ["Unit 1, 2 & 4", [1, 2, 4]],
    ["Units II and V", [2, 5]],
    ["unit-4 and unit-5", [4, 5]],
    ["Lab Ex 2–7 (Q1 from Ex 2, 3 or 4)", []],
    ["", []],
  ])("%s → %j", (p, want) => expect(unitsInPortion(p)).toEqual(want));
});

const OS: CourseUnits = {
  code: "21CSC202J",
  title: "Operating Systems",
  semester: 3,
  credits: 4,
  prerequisites: null,
  file: null,
  hasFiles: true,
  units: [
    { n: 1, title: "Intro", hours: 15, topics: ["System Calls", "Kernel", "Boot", "Protection"], refs: [], files: 3 },
    { n: 2, title: "Processes", hours: 15, topics: ["Semaphores", "Monitors"], refs: [], files: 0 },
  ],
};

describe("unitProgress", () => {
  it("counts ticked topics per unit", () => {
    const p = unitProgress(OS, [{ course_code: "21CSC202J", unit: 1, topic: "Kernel" }]);
    expect(p[0]).toMatchObject({ n: 1, ticked: 1, topics: 4, done: 0.25 });
    expect(p[1]).toMatchObject({ ticked: 0, topics: 2, done: 0 });
  });
  it("ignores ticks for topics no longer in the syllabus", () => {
    const p = unitProgress(OS, [{ course_code: "21CSC202J", unit: 2, topic: "Old topic" }]);
    expect(p[1].ticked).toBe(0);
  });
});

describe("paperShares", () => {
  it("turns counts into shares", () => {
    const m = paperShares({ "1": 1, "2": 3 });
    expect(m.get(2)).toBe(0.75);
    expect(paperShares(undefined).size).toBe(0);
  });
});

describe("courseProgress and unitsWithoutNotes", async () => {
  const { courseProgress, unitsWithoutNotes } = await import("./units");
  const ticks = [
    { course_code: "21CSC202J", unit: 1, topic: "Kernel" },
    { course_code: "21CSC202J", unit: 2, topic: "Monitors" },
  ];
  it("adds ticks up over the course, or over a portion", () => {
    expect(courseProgress(OS, ticks)).toEqual({ ticked: 2, topics: 6, pct: 33 });
    expect(courseProgress(OS, ticks, [2])).toEqual({ ticked: 1, topics: 2, pct: 50 });
  });
  it("names the units with no notes, only for a subject that has files", () => {
    expect(unitsWithoutNotes(OS).map((u) => u.n)).toEqual([2]);
    expect(unitsWithoutNotes({ ...OS, hasFiles: false })).toEqual([]);
  });
});
