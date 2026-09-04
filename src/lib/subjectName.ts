/**
 * Initials for a subject name.
 *
 * Portal subject names run to seventy characters — "UNIVERSAL HUMAN
 * VALUES - II: UNDERSTANDING HARMONY AND ETHICAL HUMAN CONDUCT". Lists
 * used to abbreviate them to fit a row, on the theory that initials beat
 * truncation: TBVP keeps the *end* of "Transforms & Boundary Value
 * Problems", where "Transforms & Boundary V…" throws it away.
 *
 * They no longer do — every subject row wraps to a second line and shows
 * the real name. What's left is the suggestion shown under the subject
 * sheet's "short name" field, so someone renaming a subject can see what
 * the app would pick before typing their own.
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
