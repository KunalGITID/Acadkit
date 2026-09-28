/** Find-in-file for the viewer: every place a word or a sentence occurs. */

const FOLD: Record<string, string> = {
  "‘": "'",
  "’": "'",
  "“": '"',
  "”": '"',
  "–": "-",
  "—": "-",
  "−": "-",
  " ": " ",
};

/**
 * The folded, collapsed form of `text`, with `map[i]` the index in `text`
 * that normalised character `i` came from.
 */
export function normalise(text: string): { norm: string; map: number[] } {
  let norm = "";
  const map: number[] = [];
  let space = false;
  for (let i = 0; i < text.length; i++) {
    const ch = FOLD[text[i]] ?? text[i];
    if (/\s/.test(ch)) {
      if (!space && norm.length) {
        norm += " ";
        map.push(i);
      }
      space = true;
      continue;
    }
    space = false;
    const lower = ch.toLowerCase();
    // toLowerCase can lengthen a character (İ → i̇); keep one per source char.
    norm += lower.length === 1 ? lower : ch;
    map.push(i);
  }
  if (norm.endsWith(" ")) {
    norm = norm.slice(0, -1);
    map.pop();
  }
  return { norm, map };
}

/** The query as the matcher sees it; empty means nothing to look for. */
export function normaliseQuery(query: string): string {
  return normalise(query).norm;
}

/** A match: [start, end) in the original text. */
export interface Span {
  start: number;
  end: number;
}

/** Every non-overlapping occurrence of `query` in `text`, in order. */
export function findAll(text: string, query: string, limit = 5000): Span[] {
  const q = normaliseQuery(query);
  if (!q) return [];
  const { norm, map } = normalise(text);
  const out: Span[] = [];
  for (let i = norm.indexOf(q); i !== -1 && out.length < limit; i = norm.indexOf(q, i + q.length)) {
    out.push({ start: map[i], end: map[i + q.length - 1] + 1 });
  }
  return out;
}

/** How many times `query` occurs in `text`. */
export function countMatches(text: string, query: string): number {
  return findAll(text, query).length;
}

/** Step through `total` matches, wrapping at both ends. */
export function stepMatch(current: number, total: number, dir: 1 | -1): number {
  if (total <= 0) return -1;
  if (current < 0) return dir === 1 ? 0 : total - 1;
  return (current + dir + total) % total;
}
