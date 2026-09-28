import { completedRecord } from "@/lib/cgpa";
import { areaRecord, isWeakArea } from "@/lib/pastRecord";
import type { SemesterArchive } from "@/types";

/** The degree's curriculum (`_src/acadkit_curriculum.json`, synced as `<pin>/curriculum.json`): every semester's courses and credits, and the elective lists. */

export interface CurriculumCourse {
  /** A course code, or a slot like "PE-3" / "OE-1" for an elective. */
  code: string;
  title: string;
  credits: number;
  /** H, B, S, C, M, O, P, E: the curriculum's categories. */
  cat: string;
  /** Any of these codes counts as this course (a language, NSS/NCC, project or MOOC). */
  choice?: string[];
  /** An elective slot: pick from `electives[slot]`. */
  slot?: "E" | "O";
}

export interface Curriculum {
  version: 1;
  program: string;
  regulation: string;
  total_credits: number;
  semesters: { n: number; credits: number; courses: CurriculumCourse[] }[];
  electives: { E: [string, string][]; O: [string, string][] };
}

const norm = (c: string) => c.replace(/\s/g, "").toUpperCase();

/** Codes that count as done or under way: archived semesters plus this term's subjects. */
export function takenCodes(archives: SemesterArchive[], currentCodes: string[]): Set<string> {
  return new Set([...archives.flatMap((a) => a.summary.map((r) => norm(r.code))), ...currentCodes.map(norm)]);
}

export function isTaken(course: CurriculumCourse, taken: Set<string>): boolean {
  const codes = (course.choice ?? [course.code]).flatMap((c) => c.split("+"));
  return codes.some((c) => taken.has(norm(c)));
}

// ---------- graduating ----------

export interface DegreeProgress {
  total: number;
  /** In archived semesters. */
  done: number;
  /** This term's subjects. */
  current: number;
  /** Still to come after this term. */
  remaining: number;
  /** CGPA so far, from archived semesters. */
  cgpa: number | null;
}

export function degreeProgress(cur: Curriculum, archives: SemesterArchive[], currentCredits: number): DegreeProgress {
  const rec = completedRecord(archives);
  return {
    total: cur.total_credits,
    done: rec.credits,
    current: currentCredits,
    remaining: Math.max(0, cur.total_credits - rec.credits - currentCredits),
    cgpa: rec.cgpa,
  };
}

export interface GraduationRung {
  target: number;
  /** Average SGPA the semesters after this one need; null when there are none left. */
  needed: number | null;
  verdict: "secured" | "reachable" | "impossible";
}

/**
 * What the rest of the degree has to average for a final CGPA, assuming
 * this semester lands on `thisSemSgpa` (your target, or the forecast).
 */
export function graduationLadder(
  cur: Curriculum,
  archives: SemesterArchive[],
  currentCredits: number,
  thisSemSgpa: number,
  targets: number[] = [8, 8.5, 9]
): GraduationRung[] {
  const rec = completedRecord(archives);
  const remaining = Math.max(0, cur.total_credits - rec.credits - currentCredits);
  const banked = rec.points + thisSemSgpa * currentCredits;
  return targets.map((target) => {
    if (remaining === 0) {
      const final = banked / Math.max(1, rec.credits + currentCredits);
      return { target, needed: null, verdict: final >= target ? "secured" : "impossible" };
    }
    const needed = (target * cur.total_credits - banked) / remaining;
    return {
      target,
      needed,
      verdict: needed <= 0 ? "secured" : needed > 10 ? "impossible" : "reachable",
    };
  });
}

// ---------- what's coming ----------

export interface Upcoming {
  semester: number;
  course: CurriculumCourse;
}

/** Credit courses after `semester` not yet taken, in a subject area that has gone badly for you. */
export function upcomingInWeakAreas(
  cur: Curriculum,
  archives: SemesterArchive[],
  taken: Set<string>,
  semester: number
): Upcoming[] {
  return cur.semesters
    .filter((s) => s.n > semester)
    .flatMap((s) =>
      s.courses
        .filter((c) => !c.slot && c.credits > 0 && !isTaken(c, taken) && isWeakArea(areaRecord(archives, c.code)))
        .map((course) => ({ semester: s.n, course }))
    );
}

export interface SetupOption {
  course: CurriculumCourse;
  /** The semester the curriculum lists it under. */
  plannedFor: number;
  /** Ticked at first: credit courses that are real codes. Non-credit and elective slots are yours to add. */
  suggested: boolean;
}

/** Courses to set a semester up with: that semester's untaken courses, then credit courses from earlier semesters still not taken (a batch that swapped them). */
export function setupOptions(cur: Curriculum, semester: number, taken: Set<string>): SetupOption[] {
  const out: SetupOption[] = [];
  for (const s of cur.semesters) {
    if (s.n > semester) break;
    for (const c of s.courses) {
      if (isTaken(c, taken)) continue;
      const here = s.n === semester;
      if (!here && (c.credits === 0 || c.slot)) continue; // old non-credit / elective slots: not worth offering
      out.push({ course: c, plannedFor: s.n, suggested: c.credits > 0 && !c.slot && !c.choice });
    }
  }
  // This semester's courses first, then carry-overs.
  return out.sort((a, b) => Number(b.plannedFor === semester) - Number(a.plannedFor === semester));
}

/** "DATA SCIENCE FOR INTERNET OF THINGS" → "Data Science for Internet of Things"; mixed case is kept as written. */
export function titleCase(s: string): string {
  if (/[a-z]/.test(s)) return s.trim();
  const small = new Set(["a", "an", "and", "as", "at", "by", "for", "in", "of", "on", "or", "the", "to", "with"]);
  return s
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i > 0 && small.has(w) ? w : w.replace(/(^|[-/(])([a-z])/g, (_, p: string, c: string) => p + c.toUpperCase())))
    .join(" ")
    // Acronyms the syllabi spell out in capitals.
    .replace(/\b(Iot|Ai|Ml|Nlp|Os|Dbms|Uhv|Ii|Iii|Iv|Mern|Ar|Vr|Ui|Ux|Api|Http)\b/g, (w) => w.toUpperCase());
}

/** Every course's proper name by code: the curriculum's (semesters, then elective lists), then a syllabus's own title for anything the curriculum doesn't list. */
export function courseNames(
  cur: Curriculum | null | undefined,
  syllabi?: Record<string, { title: string }> | null
): Map<string, string> {
  const out = new Map<string, string>();
  const put = (code: string, title: string) => {
    const k = code.replace(/\s/g, "").toUpperCase();
    if (/^\d{2}[A-Z]{3}\d{3}[A-Z]$/.test(k) && title?.trim() && !out.has(k)) out.set(k, titleCase(title));
  };
  for (const s of cur?.semesters ?? []) for (const c of s.courses) put(c.code, c.title);
  for (const [code, title] of [...(cur?.electives?.E ?? []), ...(cur?.electives?.O ?? [])]) put(code, title);
  for (const [code, c] of Object.entries(syllabi ?? {})) put(code, c.title);
  return out;
}
