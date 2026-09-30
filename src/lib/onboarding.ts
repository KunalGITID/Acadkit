/** A new student's first subjects: where they come from, and when they're ready to save. */
import { SEED_SUBJECTS } from "@/data/semester";
import type { PortalAttendanceRow } from "@/lib/portal/parse";

export interface DraftSubject {
  code: string;
  name: string;
  /** Null until known: the portal's attendance page doesn't print credits, and a guess would skew SGPA. */
  credits: number | null;
  type: "theory" | "lab";
  faculty: string | null;
  color_hex: string;
}

const PALETTE = ["#7c6af7", "#f97316", "#22d3ee", "#4ade80", "#f472b6", "#facc15", "#fb7185", "#a78bfa", "#38bdf8", "#34d399"];

const SMALL_WORDS = new Set(["and", "of", "the", "in", "for", "to", "a", "an", "on", "with"]);

/**
 * "DATA STRUCTURES AND ALGORITHMS" → "Data Structures and Algorithms". The
 * sp.srmist.edu.in portal prints titles in capitals; mixed case is left alone.
 */
export function tidyTitle(title: string): string {
  const t = title.replace(/\s+/g, " ").trim();
  if (t !== t.toUpperCase() || !/[A-Z]/.test(t)) return t;
  return t
    .toLowerCase()
    .split(" ")
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

/** Credits of the courses we already know, by code. */
const KNOWN_CREDITS = new Map(SEED_SUBJECTS.map((s) => [s.code, s.credits]));

/**
 * Subjects from a pasted attendance page, one per course code. Credits are
 * filled in only for courses we already know; the rest are left for the
 * student to enter, since nothing on that page says what they are worth.
 */
export function draftsFromPortal(rows: PortalAttendanceRow[]): DraftSubject[] {
  const seen = new Set<string>();
  const out: DraftSubject[] = [];
  for (const r of rows) {
    if (seen.has(r.subject_code)) continue;
    seen.add(r.subject_code);
    out.push({
      code: r.subject_code,
      name: (r.title && tidyTitle(r.title)) || r.subject_code,
      credits: KNOWN_CREDITS.get(r.subject_code) ?? null,
      type: /practical|lab/i.test(r.category ?? "") ? "lab" : "theory",
      // The portal appends the staff ID: "Dr. A (100001)". The name is enough.
      faculty: r.faculty?.replace(/\s*\(\d+\)\s*$/, "").trim() || null,
      color_hex: PALETTE[out.length % PALETTE.length],
    });
  }
  return out;
}

/** The CSE (Data Science) Semester 3 list the app has always started accounts with. */
export function draftsFromPreset(): DraftSubject[] {
  return SEED_SUBJECTS.map((s) => ({ ...s, faculty: null }));
}

/** Why these drafts can't be saved yet, or null when they can. */
export function draftProblem(drafts: DraftSubject[]): string | null {
  const missing = drafts.filter((d) => d.credits === null || !Number.isInteger(d.credits) || d.credits < 0 || d.credits > 10);
  if (missing.length === 1) return `Add the credits for ${missing[0].name}`;
  if (missing.length > 1) return `Add the credits for ${missing.length} subjects`;
  if (drafts.some((d) => !d.name.trim())) return "Every subject needs a name";
  return null;
}
