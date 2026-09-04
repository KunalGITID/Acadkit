import type { SubjectAttendance } from "@/lib/attendance";

/**
 * What leaves your account when you share a card.
 *
 * This module exists so the answer to "what did I just show them" is one
 * short, readable object rather than something assembled inline at a
 * call site. Everything here is deliberate, and the omissions matter
 * more than the inclusions: no marks, no SGPA, no dates, no per-class
 * records, no email, no device_id. A friend comparing bunk budgets does
 * not need your grades, and the cheapest way to guarantee they never see
 * them is for grades never to enter the payload.
 *
 * Percentages are rounded to whole numbers. 82% is the entire point of
 * the comparison; 82.3529% would only ever be used to work out exactly
 * how many classes you have sat, which is a detail you did not agree to
 * share.
 */

/** Characters for share codes: no 0/O/1/I/L, which get misread aloud. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
/** 10 chars of this alphabet is ~49 bits — not something you guess. */
const CODE_LENGTH = 10;

export interface SharedSubject {
  name: string;
  color: string;
  percentage: number;
}

export interface SharedCard {
  /** Display name, if the owner set one. Never an email. */
  name: string | null;
  /** Overall attendance, rounded. Null when nothing is marked. */
  overall: number | null;
  subjects: SharedSubject[];
  /** Schema marker, so a future change can be told apart from this one. */
  v: 1;
}

export function buildSharedCard(
  name: string | null,
  overall: number | null,
  subjects: SubjectAttendance[]
): SharedCard {
  return {
    name: name?.trim() ? name.trim() : null,
    overall: overall === null ? null : Math.round(overall),
    subjects: subjects
      .filter((s) => s.total > 0 && s.percentage !== null)
      .map((s) => ({
        name: s.subject.name,
        color: s.subject.color_hex,
        percentage: Math.round(s.percentage!),
      })),
    v: 1,
  };
}

/**
 * A code you can read down a phone.
 *
 * `crypto.getRandomValues` rather than Math.random: this is the only
 * thing standing between a stranger and someone's attendance, and a
 * predictable generator would make the whole design decorative.
 *
 * The modulo is unbiased because the alphabet's length divides evenly
 * into the byte range it samples from — bytes at or above the largest
 * multiple of 31 under 256 are discarded rather than folded in.
 */
export function makeShareCode(): string {
  const limit = Math.floor(256 / CODE_ALPHABET.length) * CODE_ALPHABET.length;
  let out = "";
  while (out.length < CODE_LENGTH) {
    const bytes = new Uint8Array(CODE_LENGTH);
    crypto.getRandomValues(bytes);
    for (const b of bytes) {
      if (out.length === CODE_LENGTH) break;
      if (b >= limit) continue;
      out += CODE_ALPHABET[b % CODE_ALPHABET.length];
    }
  }
  return out;
}

/** Accepts what people actually type: any case, spaces, dashes. */
export function normaliseShareCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export interface ComparisonRow {
  name: string;
  color: string;
  /** Null when only one side takes this subject. */
  mine: number | null;
  theirs: number | null;
}

/**
 * Line up two cards by subject name.
 *
 * Matching on name is the only option — subject ids are per-account —
 * so it normalises case and spacing. Subjects only one of you takes are
 * kept rather than dropped: "you don't even take this one" is part of
 * the comparison, and silently hiding rows would make the totals look
 * like they disagree with the list.
 */
export function compareCards(
  mine: SharedCard,
  theirs: SharedCard
): { rows: ComparisonRow[]; overall: { mine: number | null; theirs: number | null } } {
  const key = (n: string) => n.trim().toLowerCase().replace(/\s+/g, " ");
  const rows = new Map<string, ComparisonRow>();

  for (const s of mine.subjects) {
    rows.set(key(s.name), { name: s.name, color: s.color, mine: s.percentage, theirs: null });
  }
  for (const s of theirs.subjects) {
    const k = key(s.name);
    const existing = rows.get(k);
    if (existing) existing.theirs = s.percentage;
    else rows.set(k, { name: s.name, color: s.color, mine: null, theirs: s.percentage });
  }

  return {
    rows: [...rows.values()].sort((a, b) => a.name.localeCompare(b.name)),
    overall: { mine: mine.overall, theirs: theirs.overall },
  };
}
