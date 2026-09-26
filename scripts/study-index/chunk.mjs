/**
 * Cutting extracted text into passages for search.
 *
 * A passage is about 900 characters — a paragraph or two, well inside
 * gte-small's 512-token window — with 150 carried over from the one
 * before, so an idea that straddles a cut is still found whole in one
 * of them. Cuts land on a line or sentence end where there is one.
 */

/** Tidy a page: rejoin words hyphenated across lines, collapse spacing, drop bare page numbers. */
export function cleanPage(text) {
  return String(text ?? "")
    .replace(/\r/g, "")
    .replace(/(\w)-\n(?=[a-z])/g, "$1")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line && !/^(page\s*)?\d+(\s*(of|\/)\s*\d+)?$/i.test(line))
    .join("\n");
}

/**
 * Passages from a document's pages, each remembering its page (1-based)
 * and its index in the document. Passages with too few letters — a
 * table of numbers, a page of OCR noise — are dropped.
 */
export function chunkPages(pages, { size = 900, overlap = 150, minLetters = 60 } = {}) {
  const out = [];
  (pages ?? []).forEach((raw, i) => {
    const text = cleanPage(raw);
    let start = 0;
    while (start < text.length) {
      let end = Math.min(start + size, text.length);
      if (end < text.length) {
        const half = start + Math.floor(size / 2);
        const tail = text.slice(half, end);
        const cut = Math.max(tail.lastIndexOf("\n"), tail.lastIndexOf(". "));
        if (cut > 0) end = half + cut + 1;
      }
      const content = text.slice(start, end).trim();
      if ((content.match(/[a-z]/gi) ?? []).length >= minLetters) out.push({ page: i + 1, content });
      if (end >= text.length) break;
      start = Math.max(end - overlap, start + 1);
    }
  });
  return out.map((c, index) => ({ ...c, index }));
}

/** "OS_21CSC202J/02_Notes/Unit_3_Deadlocks.pdf" → "OS 21CSC202J · Unit 3 Deadlocks". */
export function titleFor(filePath) {
  const parts = String(filePath).split("/");
  const name = parts[parts.length - 1].replace(/\.[a-z0-9]+$/i, "").replace(/[_]+/g, " ").trim();
  const subject = parts.length > 1 ? parts[0].replace(/[_]+/g, " ").trim() : "";
  return subject ? `${subject} · ${name}` : name;
}
