import { countsInSgpa, GRADE_TABLE } from "@/lib/grades";
import type { SemesterArchive, SubjectArchiveRow } from "@/types";

/** Semesters before AcadKit, from the transcript, and what they say about you. */

// ---------- areas ----------

export type AreaId = "maths" | "computing" | "science" | "languages" | "practice";

export interface Area {
  id: AreaId;
  label: string;
}

const AREAS: Record<AreaId, string> = {
  maths: "Maths",
  computing: "Computing",
  science: "Science & engineering",
  languages: "Languages & humanities",
  practice: "Workshops & practice",
};

/**
 * SRM course codes are "21" + a department + a number + a type letter:
 * 21MAB201T is maths (MA…), 21CSC202J computing (CS…). Anything not
 * recognised is left without an area rather than guessed.
 */
const DEPTS: [RegExp, AreaId][] = [
  [/^MA/, "maths"],
  [/^(CS|IT|AI|DS)/, "computing"],
  [/^(LE|GN|HS|LA)/, "languages"],
  [/^(ME|GNM|NC)/, "practice"],
  [/^(PY|CY|BT|EE|EC|BI|PH)/, "science"],
];

export function subjectArea(code: string): Area | null {
  const m = /^\d{2}([A-Z]{3})\d{3}[A-Z]$/.exec(code.replace(/\s/g, "").toUpperCase());
  if (!m) return null;
  const dept = m[1];
  // Workshops and national-service style courses before the broad rules.
  if (/^(MES|GNM)/.test(dept)) return { id: "practice", label: AREAS.practice };
  for (const [re, id] of DEPTS) if (re.test(dept)) return { id, label: AREAS[id] };
  return null;
}

// ---------- grades ----------

const POINTS = new Map(GRADE_TABLE.map((g) => [g.grade as string, g.points]));

/**
 * The middle of each grade's band out of 100 (O is 91–100 → 95.5). Only
 * ever used as a difference between areas, never as your mark.
 */
const MIDPOINT: Record<string, number> = { O: 95.5, "A+": 86, A: 76, "B+": 66, B: 58.5, C: 53, F: 40 };

export const TRANSCRIPT_COLORS = ["#60a5fa", "#f472b6", "#34d399", "#fbbf24", "#a78bfa", "#fb923c", "#22d3ee", "#f87171", "#a3e635", "#e879f9"];

export type AttendanceBand = "H" | "9" | "8" | "L";

/** The grade card's attendance codes (printed on its back). */
export const ATTENDANCE_BANDS: Record<AttendanceBand, string> = {
  H: "95%+",
  "9": "85–94%",
  "8": "75–84%",
  L: "under 75%",
};

export interface TranscriptRow {
  code: string;
  name: string;
  credits: number;
  grade: string;
  /** Printed as "A*": marked by you, no reason stored. */
  starred: boolean;
  /** The grade card's ATT CODE, when the line carries one. */
  band?: AttendanceBand;
}

export interface ParsedTranscript {
  rows: TranscriptRow[];
  /** Lines that couldn't be read, as typed. */
  skipped: string[];
}

const CODE = /\b(\d{2}[A-Z]{3}\d{3}[A-Z])\b/;
const GRADE = /^(O|A\+|A|B\+|B|C|F|P|AB|W)(\*?)$/i;

/** Lines copied from the portal's grade table, or typed: a course code, the course name, credits, grade, and optionally the grade card's attendance code (H, 9, 8, L). */
export function parseTranscript(text: string): ParsedTranscript {
  const byCode = new Map<string, TranscriptRow>();
  const skipped: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^(semester|sgpa|cgpa)\b/i.test(line)) continue;
    const code = CODE.exec(line.toUpperCase());
    if (!code) {
      skipped.push(line);
      continue;
    }
    const rest = line.slice(code.index + code[1].length);
    const tokens = rest.split(/[\s,\t|]+/).filter(Boolean);
    // "… 4 A+ 8": a trailing attendance code after the grade.
    let band: AttendanceBand | undefined;
    if (tokens.length >= 3 && /^(H|L|8|9)$/i.test(tokens[tokens.length - 1]) && GRADE.test(tokens[tokens.length - 2]))
      band = tokens.pop()!.toUpperCase() as AttendanceBand;
    const gradeTok = tokens.pop() ?? "";
    const creditTok = tokens.pop() ?? "";
    const g = GRADE.exec(gradeTok);
    const credits = Number(creditTok);
    if (!g || !Number.isFinite(credits) || credits < 0 || credits > 30) {
      skipped.push(line);
      continue;
    }
    const name = tokens.join(" ").replace(/\s+/g, " ").trim();
    byCode.set(code[1], {
      code: code[1],
      name: titleCase(name) || code[1],
      credits,
      grade: g[1].toUpperCase(),
      starred: g[2] === "*",
      ...(band ? { band } : {}),
    });
  }
  return { rows: [...byCode.values()], skipped };
}

function titleCase(s: string): string {
  if (s !== s.toUpperCase()) return s;
  const small = new Set(["and", "of", "for", "to", "in", "the"]);
  return s
    .toLowerCase()
    .split(" ")
    .map((w, i) => (i > 0 && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

/** SGPA the SRM way: Σ points × credits over credit-bearing courses. */
export function sgpaOf(rows: (Pick<TranscriptRow, "credits" | "grade"> & { code?: string })[]): { sgpa: number | null; credits: number } {
  const counted = rows.filter((r) => countsInSgpa(r) && POINTS.has(r.grade));
  const credits = counted.reduce((n, r) => n + r.credits, 0);
  const points = counted.reduce((n, r) => n + r.credits * (POINTS.get(r.grade) ?? 0), 0);
  return { sgpa: credits > 0 ? points / credits : null, credits };
}

/** A transcript semester as an archive to insert. */
export function transcriptArchive(
  label: string,
  rows: TranscriptRow[]
): Pick<SemesterArchive, "label" | "sgpa" | "credits" | "summary" | "sem_start" | "sem_end"> {
  const { sgpa, credits } = sgpaOf(rows);
  const summary: SubjectArchiveRow[] = rows.map((r, i) => ({
    code: r.code,
    name: r.name,
    credits: r.credits,
    grade: r.grade,
    points: POINTS.get(r.grade) ?? 0,
    total: null,
    attendancePct: null,
    color_hex: TRANSCRIPT_COLORS[i % TRANSCRIPT_COLORS.length],
    ...(r.starred ? { starred: true } : {}),
    ...(r.band ? { attendanceBand: r.band } : {}),
  }));
  return {
    label,
    // Stored as SRM prints it, three places, so CGPA sums match the transcript.
    sgpa: sgpa === null ? null : Math.round(sgpa * 1000) / 1000,
    credits,
    summary,
    sem_start: null,
    sem_end: null,
  };
}

// ---------- what the record says ----------

interface Graded {
  code: string;
  name: string;
  grade: string;
  credits: number;
  starred: boolean;
}

/** Every credit-bearing, graded course across archived semesters. */
function pastCourses(archives: SemesterArchive[]): Graded[] {
  // Oldest first, so a list of grades reads in the order they happened.
  const ordered = [...archives].sort((a, b) => (a.archived_at ?? "").localeCompare(b.archived_at ?? ""));
  return ordered.flatMap((a) =>
    a.summary
      .filter((r) => countsInSgpa(r) && r.grade in MIDPOINT)
      .map((r) => ({ code: r.code, name: r.name, grade: r.grade, credits: r.credits, starred: !!r.starred }))
  );
}

const weighted = (xs: Graded[], f: (g: Graded) => number) => {
  const c = xs.reduce((n, x) => n + x.credits, 0);
  return c > 0 ? xs.reduce((n, x) => n + x.credits * f(x), 0) / c : null;
};

export interface AreaRecord {
  area: Area;
  courses: Graded[];
  /** Credit-weighted grade points in this area, and across everything. */
  points: number;
  overallPoints: number;
  /**
   * How far this area's grades sit from your overall record, as a share of
   * the marks (−0.14 = about 14 marks in 100 lower), shrunk toward zero
   * when the area has few courses: two grades are a hint, not a verdict.
   */
  offset: number;
}

/** Past courses needed before an area moves anything. */
const SHRINK = 2;

export function areaRecord(archives: SemesterArchive[], code: string): AreaRecord | null {
  const area = subjectArea(code);
  if (!area) return null;
  const all = pastCourses(archives);
  const mine = all.filter((c) => subjectArea(c.code)?.id === area.id);
  if (mine.length === 0) return null;
  const score = (g: Graded) => MIDPOINT[g.grade];
  const pts = (g: Graded) => POINTS.get(g.grade) ?? 0;
  const areaScore = weighted(mine, score)!;
  const overallScore = weighted(all, score)!;
  return {
    area,
    courses: mine,
    points: weighted(mine, pts)!,
    overallPoints: weighted(all, pts)!,
    offset: ((areaScore - overallScore) / 100) * (mine.length / (mine.length + SHRINK)),
  };
}

/** A whole grade point or more below your record, over at least two courses. */
export function isWeakArea(r: AreaRecord | null): r is AreaRecord {
  return !!r && r.courses.length >= 2 && r.overallPoints - r.points >= 1;
}

/** Per-subject nudges for the odds model, by subject id. */
export function historyOffsets(archives: SemesterArchive[], subjects: { id: string; code: string }[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of subjects) {
    const r = areaRecord(archives, s.code);
    if (r && r.offset !== 0) out.set(s.id, r.offset);
  }
  return out;
}
