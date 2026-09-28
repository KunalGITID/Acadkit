import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { SemesterArchive } from "@/types";
import { degreeProgress, graduationLadder, isTaken, setupOptions, takenCodes, upcomingInWeakAreas, type Curriculum } from "./curriculum";

const archive = (label: string, sgpa: number, credits: number, rows: [string, string, number][]): SemesterArchive => ({
  id: label,
  device_id: "x",
  label,
  sgpa,
  credits,
  sem_start: null,
  sem_end: null,
  summary: rows.map(([code, grade, cr]) => ({ code, name: code, credits: cr, grade, points: 0, total: null, attendancePct: null, color_hex: "#000" })),
});

// The user's record: Sem 1 8.682/22, Sem 2 7.571/21; maths A then C.
const ARCHIVES = [
  archive("S1", 8.682, 22, [["21MAB101T", "A", 4], ["21CSS101J", "A+", 4], ["21LEH103T", "A", 3], ["21CYB101J", "A+", 5], ["21GNM102L", "O", 0]]),
  archive("S2", 7.571, 21, [["21MAB102T", "C", 4], ["21CSC101T", "A+", 3], ["21LEH101T", "O", 3], ["21PYB102J", "A", 5]]),
];
const CURRENT = ["21MAB201T", "21CSC201J", "21CSC202J", "21CSC206P", "21CSS202T", "21LEM201T", "21LEM202T"];

const CUR: Curriculum = {
  version: 1,
  program: "test",
  regulation: "2021",
  total_credits: 163,
  semesters: [
    { n: 1, credits: 22, courses: [{ code: "21LEH103T", title: "Language", credits: 3, cat: "H", choice: ["21LEH102T", "21LEH103T"] }, { code: "21GNM101L", title: "NSS etc", credits: 0, cat: "M", choice: ["21GNM101L", "21GNM102L"] }] },
    { n: 3, credits: 23, courses: [{ code: "21DCS201P", title: "Design Thinking", credits: 3, cat: "S" }, { code: "21MAB201T", title: "TBVP", credits: 4, cat: "B" }, { code: "21PDM201L", title: "Verbal", credits: 0, cat: "M" }] },
    {
      n: 4,
      credits: 23,
      courses: [
        { code: "21MAB301T", title: "Probability and Statistics", credits: 4, cat: "B" },
        { code: "21CSC204J", title: "DAA", credits: 4, cat: "C" },
        { code: "PE-1", title: "Professional Elective I", credits: 3, cat: "E", slot: "E" },
        { code: "21LEM202T", title: "UHV II", credits: 3, cat: "M" },
        { code: "21PDM202L", title: "Critical Thinking", credits: 0, cat: "M" },
      ],
    },
    { n: 5, credits: 21, courses: [{ code: "21MAB302T", title: "Discrete Mathematics", credits: 4, cat: "B" }, { code: "21CSC302J", title: "Networks", credits: 4, cat: "C" }] },
  ],
  electives: { E: [], O: [] },
};

describe("taken courses", () => {
  const taken = takenCodes(ARCHIVES, CURRENT);
  it("counts a choice group as taken when any member was", () => {
    expect(isTaken(CUR.semesters[0].courses[0], taken)).toBe(true); // French for the language
    expect(isTaken(CUR.semesters[0].courses[1], taken)).toBe(true); // NSS for the GNM group
  });
  it("sees this term's subjects as taken", () => {
    expect(isTaken(CUR.semesters[2].courses[3], taken)).toBe(true); // UHV II, moved to sem 3
  });
});

describe("graduating", () => {
  it("counts credits done, this term and left", () => {
    expect(degreeProgress(CUR, ARCHIVES, 23)).toMatchObject({ total: 163, done: 43, current: 23, remaining: 97 });
  });
  it("works out the average the rest of the degree needs, with this term at 8.14", () => {
    const [eight, eightFive, nine] = graduationLadder(CUR, ARCHIVES, 23, 8.14);
    const banked = 8.682 * 22 + 7.571 * 21 + 8.14 * 23;
    expect(eightFive.needed).toBeCloseTo((8.5 * 163 - banked) / 97, 6);
    expect(eight.verdict).toBe("reachable");
    expect(nine.needed!).toBeGreaterThan(9.2);
  });
});

describe("what's coming", () => {
  const taken = takenCodes(ARCHIVES, CURRENT);
  it("lists future maths, since maths has gone worst", () => {
    expect(upcomingInWeakAreas(CUR, ARCHIVES, taken, 3).map((u) => [u.semester, u.course.code])).toEqual([
      [4, "21MAB301T"],
      [5, "21MAB302T"],
    ]);
  });
  it("sets up sem 4 with its own courses, then the swapped-out Design Thinking", () => {
    const opts = setupOptions(CUR, 4, taken);
    expect(opts.map((o) => [o.course.code, o.plannedFor, o.suggested])).toEqual([
      ["21MAB301T", 4, true],
      ["21CSC204J", 4, true],
      ["PE-1", 4, false],
      ["21PDM202L", 4, false],
      ["21DCS201P", 3, true],
    ]);
  });
});

// The real file, when this Mac has it: totals must match the curriculum document.
const REAL = path.join(homedir(), "Documents/SRM_Sem3/_src/acadkit_curriculum.json");
// A skipped describe's body still runs while tests are collected, so the
// read is guarded too - unguarded, the whole file failed on any machine
// without the study folder.
describe.skipIf(!existsSync(REAL))("the real curriculum file", () => {
  const cur = (existsSync(REAL) ? JSON.parse(readFileSync(REAL, "utf8")) : { semesters: [], total_credits: 0 }) as Curriculum;
  it("adds up per semester and in all", () => {
    for (const s of cur.semesters) expect(s.courses.reduce((n, c) => n + c.credits, 0)).toBe(s.credits);
    expect(cur.semesters.reduce((n, s) => n + s.credits, 0)).toBe(cur.total_credits);
  });
  it("leaves 97 credits after this semester for this record", () => {
    expect(degreeProgress(cur, ARCHIVES, 23).remaining).toBe(97);
  });
});

describe("courseNames", async () => {
  const { courseNames, titleCase } = await import("./curriculum");
  it("names a course from the curriculum, then its syllabus", () => {
    const names = courseNames(
      {
        version: 1, program: "", regulation: "", total_credits: 0,
        semesters: [{ n: 3, credits: 4, courses: [{ code: "21CSS202T", title: "Fundamentals of Data Science", credits: 4, cat: "C" }] }],
        electives: { E: [["21CSE429T", "Data Science for Internet of Things"]], O: [] },
      },
      { "21CSE373T": { title: "STREAMING ANALYTICS" } }
    );
    expect(names.get("21CSS202T")).toBe("Fundamentals of Data Science");
    expect(names.get("21CSE429T")).toBe("Data Science for Internet of Things");
    expect(names.get("21CSE373T")).toBe("Streaming Analytics");
  });
  it("title-cases capitals, keeping acronyms", () => {
    expect(titleCase("DATA SCIENCE FOR INTERNET OF THINGS (IOT)")).toBe("Data Science for Internet of Things (IOT)");
    expect(titleCase("UNIVERSAL HUMAN VALUES - II")).toBe("Universal Human Values - II");
  });
});
