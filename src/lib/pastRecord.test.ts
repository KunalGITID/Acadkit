import { describe, expect, it } from "vitest";
import type { SemesterArchive } from "@/types";
import { areaRecord, historyOffsets, isWeakArea, parseTranscript, sgpaOf, subjectArea, transcriptArchive } from "./pastRecord";

// The two semesters as copied from the portal (Calculus marked with *, as the user asked).
const SEM1 = `1 DEC/2025 21BTB102T INTRODUCTION TO COMPUTATIONAL BIOLOGY 2 A+
1 DEC/2025 21CSS101J PROGRAMMING FOR PROBLEM SOLVING 4 A+
1 DEC/2025 21CYB101J CHEMISTRY 5 A+
1 DEC/2025 21GNH101J PHILOSOPHY OF ENGINEERING 2 A+
1 DEC/2025 21GNM102L NATIONAL SERVICE SCHEME 0 O
1 DEC/2025 21LEH103T FRENCH 3 A
1 MAY/2026 21MAB101T CALCULUS AND LINEAR ALGEBRA 4 A*
1 DEC/2025 21MES101L BASIC CIVIL AND MECHANICAL WORKSHOP 2 A+
SGPA 8.682`;
const SEM2 = `2 MAY/2026 21CSC101T OBJECT ORIENTED DESIGN AND PROGRAMMING 3 A+
2 MAY/2026 21CYM101T ENVIRONMENTAL SCIENCE 0 O
2 MAY/2026 21EES101T ELECTRICAL AND ELECTRONICS ENGINEERING 4 B+
2 MAY/2026 21LEH101T COMMUNICATIVE ENGLISH 3 O
2 MAY/2026 21LEM101T CONSTITUTION OF INDIA 0 A+
2 MAY/2026 21MAB102T ADVANCED CALCULUS AND COMPLEX ANALYSIS 4 C
2 MAY/2026 21MES102L ENGINEERING GRAPHICS AND DESIGN 2 B+
2 MAY/2026 21PYB102J SEMICONDUCTOR PHYSICS AND COMPUTATIONAL METHODS 5 A`;

const asArchive = (label: string, text: string): SemesterArchive => ({
  id: label,
  device_id: "1234",
  archived_at: undefined,
  ...transcriptArchive(label, parseTranscript(text).rows),
});

describe("parseTranscript", () => {
  const p = parseTranscript(SEM1);
  it("reads every course, skipping the SGPA line", () => {
    expect(p.rows).toHaveLength(8);
    expect(p.skipped).toEqual([]);
  });
  it("keeps the star and title-cases names", () => {
    const calc = p.rows.find((r) => r.code === "21MAB101T")!;
    expect(calc).toMatchObject({ grade: "A", starred: true, credits: 4, name: "Calculus and Linear Algebra" });
  });
  it("takes comma-separated lines too, and reports what it can't read", () => {
    const q = parseTranscript("21CSC101T, Object Oriented Design, 3, A+\nnot a course line");
    expect(q.rows[0]).toMatchObject({ code: "21CSC101T", credits: 3, grade: "A+", starred: false });
    expect(q.skipped).toEqual(["not a course line"]);
  });
  it("reads the grade card's attendance code after the grade", () => {
    const q = parseTranscript("21MAB101T Calculus 4 A* 8\n21GNH101J Philosophy 2 A+ 9\n21CSS101J PPS 4 A+");
    expect(q.rows.map((r) => [r.grade, r.starred, r.band])).toEqual([
      ["A", true, "8"],
      ["A+", false, "9"],
      ["A+", false, undefined],
    ]);
    const a = transcriptArchive("S", q.rows);
    expect(a.summary.map((r) => r.attendanceBand)).toEqual(["8", "9", undefined]);
    expect(a.summary[0].attendancePct).toBeNull();
  });
  it("keeps the later line when a code repeats", () => {
    const q = parseTranscript("21MAB101T Calc 4 F\n21MAB101T Calc 4 A");
    expect(q.rows).toHaveLength(1);
    expect(q.rows[0].grade).toBe("A");
  });
});

describe("SGPA and CGPA match the transcript", () => {
  it("sem 1 is 8.682 and sem 2 is 7.571 (zero-credit courses left out)", () => {
    expect(sgpaOf(parseTranscript(SEM1).rows)).toEqual({ sgpa: 191 / 22, credits: 22 });
    expect(asArchive("S1", SEM1).sgpa).toBe(8.682);
    expect(asArchive("S2", SEM2).sgpa).toBe(7.571);
  });
  it("stores no total or attendance it doesn't have", () => {
    const row = asArchive("S1", SEM1).summary[0];
    expect(row.total).toBeNull();
    expect(row.attendancePct).toBeNull();
  });
});

describe("subjectArea", () => {
  it.each([
    ["21MAB201T", "maths"],
    ["21CSC202J", "computing"],
    ["21CSS202T", "computing"],
    ["21LEH103T", "languages"],
    ["21GNH101J", "languages"],
    ["21PYB102J", "science"],
    ["21EES101T", "science"],
    ["21MES102L", "practice"],
    ["21GNM102L", "practice"],
  ])("%s → %s", (code, id) => expect(subjectArea(code)?.id).toBe(id));
  it("leaves an unknown code alone", () => {
    expect(subjectArea("CS101")).toBeNull();
    expect(subjectArea("21XYZ101T")).toBeNull();
  });
});

describe("what the record says", () => {
  // Newest first, as History fetches them.
  const archives = [
    { ...asArchive("Semester 2", SEM2), archived_at: "2026-05-31T12:00:00Z" },
    { ...asArchive("Semester 1", SEM1), archived_at: "2025-12-31T12:00:00Z" },
  ];
  it("finds maths a weak area: A and C against an 8.14 record", () => {
    const r = areaRecord(archives, "21MAB201T")!;
    expect(r.courses.map((c) => c.grade)).toEqual(["A", "C"]);
    expect(r.points).toBe(6.5);
    expect(r.overallPoints).toBeCloseTo(350 / 43, 5);
    expect(r.offset).toBeLessThan(-0.05);
    expect(isWeakArea(r)).toBe(true);
  });
  it("finds computing strong and not weak", () => {
    const r = areaRecord(archives, "21CSC202J")!;
    expect(r.points).toBe(9);
    expect(r.offset).toBeGreaterThan(0);
    expect(isWeakArea(r)).toBe(false);
  });
  it("gives nudges only where there is history", () => {
    const m = historyOffsets(archives, [
      { id: "tbvp", code: "21MAB201T" },
      { id: "os", code: "21CSC202J" },
      { id: "odd", code: "21XYZ101T" },
    ]);
    expect(m.get("tbvp")!).toBeLessThan(0);
    expect(m.get("os")!).toBeGreaterThan(0);
    expect(m.has("odd")).toBe(false);
  });
  it("says nothing with no archives", () => {
    expect(areaRecord([], "21MAB201T")).toBeNull();
  });
});
