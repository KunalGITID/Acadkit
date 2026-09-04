import type { Subject } from "@/types";

/**
 * A name that fits a list row.
 *
 * Portal subject names run to seventy characters — "UNIVERSAL HUMAN
 * VALUES - II: UNDERSTANDING HARMONY AND ETHICAL HUMAN CONDUCT" — and
 * truncate identically in every list, which turns distinct subjects into
 * the same ellipsis.
 *
 * An explicit `short_name` always wins. Otherwise the name is abbreviated
 * by initials, which beats truncation because it keeps the *end* of the
 * name: "Transforms & Boundary Value Problems" reads as TBVP rather than
 * "Transforms & Boundary V…", and the two subjects starting "Data" stay
 * distinguishable.
 */

/** Words that carry no signal in an abbreviation. */
const NOISE = new Set([
  "and", "of", "the", "to", "for", "in", "on", "with", "a", "an", "ii", "i",
]);

export function abbreviate(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/[\s-]+/)
    .filter((w) => w && !NOISE.has(w.toLowerCase()));

  if (!words.length) return name.slice(0, 4).toUpperCase();
  // One real word: keep it readable rather than reducing it to a letter.
  if (words.length === 1) return words[0].slice(0, 6);
  return words.map((w) => w[0].toUpperCase()).join("").slice(0, 5);
}

/** Full name for headings, short for rows. */
export function shortName(subject: Pick<Subject, "name" | "short_name">): string {
  const explicit = subject.short_name?.trim();
  if (explicit) return explicit;
  return abbreviate(subject.name);
}

/** Use the full name when it fits; abbreviate only when it wouldn't. */
export function fitName(
  subject: Pick<Subject, "name" | "short_name">,
  maxChars = 22
): string {
  const explicit = subject.short_name?.trim();
  if (explicit) return explicit;
  return subject.name.length <= maxChars ? subject.name : abbreviate(subject.name);
}
