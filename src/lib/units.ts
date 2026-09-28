/**
 * Syllabus units (<pin>/units.json, built by scripts/study-index/units.mjs):
 * each course's units and topics from the university's syllabus, with where
 * your notes cover each unit and how much of the past papers it carries.
 */

export interface StudyRefLite {
  path: string;
  page: number | null;
}

export interface SyllabusUnit {
  n: number;
  title: string;
  hours: number | null;
  topics: string[];
  /** Best-matching notes for the unit, closest first. */
  refs: StudyRefLite[];
  /** How many of the subject's own files match it at all. 0 is a gap. */
  files: number;
}

export interface CourseUnits {
  code: string;
  title: string;
  semester: number | "E" | "O";
  credits: number;
  prerequisites: string | null;
  /** The course's syllabus PDF in the study folder. */
  file: string | null;
  /** Whether the study folder has any files for this subject (coverage means nothing otherwise). */
  hasFiles: boolean;
  units: SyllabusUnit[];
}

export interface UnitsData {
  version: 1;
  generatedAt: number;
  courses: Record<string, CourseUnits>;
}

export interface Tick {
  course_code: string;
  unit: number;
  topic: string;
}

const ROMAN: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6 };
const num = (s: string) => (/^\d+$/.test(s) ? Number(s) : ROMAN[s.toLowerCase()] ?? NaN);

/**
 * The units an exam portion names: "Unit III", "Units 1-3", "Unit 1, 2 & 4",
 * "Unit I–II". Empty when it names none ("Lab Ex 2–7" is not units).
 */
export function unitsInPortion(portion: string | null | undefined): number[] {
  if (!portion) return [];
  const out = new Set<number>();
  const TOKEN = "(\\d|iv|v?i{1,3}|vi|v)";
  const re = new RegExp(`units?\\s*[-–:]?\\s*${TOKEN}((?:\\s*(?:,|&|and|to|-|–)\\s*${TOKEN}\\b)*)`, "gi");
  for (const m of portion.matchAll(re)) {
    const parts = [m[1], ...(m[2].match(new RegExp(`(?:,|&|and|to|-|–)\\s*${TOKEN}\\b`, "gi")) ?? [])];
    let prev: number | null = null;
    for (const part of parts) {
      const range = /^\s*(to|-|–)/i.test(part);
      const n = num(part.replace(/^\s*(,|&|and|to|-|–)\s*/i, "").trim());
      if (!Number.isFinite(n) || n < 1 || n > 6) continue;
      if (range && prev !== null) for (let k = prev; k <= n; k++) out.add(k);
      else out.add(n);
      prev = n;
    }
  }
  return [...out].sort((a, b) => a - b);
}

export interface UnitProgress {
  n: number;
  ticked: number;
  topics: number;
  /** Ticked topics, 0–1. */
  done: number;
}

/** How far through each unit you are: topics ticked. */
export function unitProgress(course: CourseUnits, ticks: Tick[]): UnitProgress[] {
  return course.units.map((u) => {
    const mine = new Set(ticks.filter((t) => t.course_code === course.code && t.unit === u.n).map((t) => t.topic));
    const ticked = u.topics.filter((t) => mine.has(t)).length;
    return {
      n: u.n,
      ticked,
      topics: u.topics.length,
      done: u.topics.length ? ticked / u.topics.length : 0,
    };
  });
}

/** Past-paper questions per unit as shares of the subject's total (topics.json `unitShare`). */
export function paperShares(unitShare: Record<string, number> | undefined): Map<number, number> {
  const out = new Map<number, number>();
  if (!unitShare) return out;
  const total = Object.values(unitShare).reduce((a, b) => a + b, 0);
  if (!total) return out;
  for (const [k, v] of Object.entries(unitShare)) out.set(Number(k), v / total);
  return out;
}

/** Topics ticked across a course, or across the units given (an exam's portion). */
export function courseProgress(course: CourseUnits, ticks: Tick[], only?: number[]): { ticked: number; topics: number; pct: number } {
  const units = course.units.filter((u) => !only || only.includes(u.n));
  const rows = unitProgress({ ...course, units }, ticks);
  const ticked = rows.reduce((n, r) => n + r.ticked, 0);
  const topics = rows.reduce((n, r) => n + r.topics, 0);
  return { ticked, topics, pct: topics ? Math.round((ticked / topics) * 100) : 0 };
}

/**
 * Units your folder has nothing for. Only said of a subject whose folder
 * has files at all: a course not started yet has no notes by design, and
 * listing every unit of it as a gap would be noise.
 */
export function unitsWithoutNotes(course: CourseUnits): SyllabusUnit[] {
  return course.hasFiles ? course.units.filter((u) => u.files === 0) : [];
}
