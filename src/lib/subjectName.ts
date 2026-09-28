/** Initials for a subject name. */

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
