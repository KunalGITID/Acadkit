import { extOf } from "@/lib/studyFiles";

/** How the in-app viewer shows a file. */
export type ViewerKind = "pdf" | "docx" | "pptx" | "sheet" | "code" | "text" | "image" | "legacy" | "html" | "none";

const CODE: Record<string, string> = {
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  py: "python",
  java: "java",
  js: "javascript",
  ts: "typescript",
  sql: "sql",
  sh: "bash",
  html: "xml",
  xml: "xml",
  css: "css",
  json: "json",
};

const TEXT = new Set(["txt", "md", "log", "ini", "yaml", "yml"]);
const SHEET = new Set(["xlsx", "csv", "tsv"]);
const IMAGE = new Set(["png", "jpg", "jpeg", "gif", "webp", "heic", "svg"]);

export function viewerKind(path: string): ViewerKind {
  const ext = extOf(path);
  if (ext === "pdf") return "pdf";
  if (ext === "docx") return "docx";
  if (ext === "pptx") return "pptx";
  if (SHEET.has(ext)) return "sheet";
  if (ext === "doc" || ext === "ppt" || ext === "xls") return "legacy";
  if (ext in CODE) return "code";
  if (TEXT.has(ext)) return "text";
  if (IMAGE.has(ext)) return "image";
  return "none";
}

/**
 * What the viewer actually renders for a file: the file itself, or, for
 * an old Office format the Mac converted, its preview. `key` is the blob
 * to download.
 */
export function shownFile(file: { path: string; key: string; preview?: { key: string; ext: string } | null }): {
  kind: ViewerKind;
  key: string;
  ext: string;
} {
  const kind = viewerKind(file.path);
  // The study folder's own notes: a web version made from the same source,
  // which reflows to the screen where the PDF's page width can't.
  if (file.preview?.ext === "html") return { kind: "html", key: file.preview.key, ext: "html" };
  if (kind === "legacy" && file.preview) return { kind: viewerKind(`x.${file.preview.ext}`), key: file.preview.key, ext: file.preview.ext };
  return { kind, key: file.key, ext: extOf(file.path) };
}

/** Kinds the viewer draws (the rest offer the download). */
export function isRenderable(kind: ViewerKind): boolean {
  return kind !== "none" && kind !== "legacy";
}

/** The highlight.js language for a code file, or null. */
export function codeLanguage(path: string): string | null {
  return CODE[extOf(path)] ?? null;
}

/** Where a file opens: the viewer route, at a page for a PDF. */
export function viewerHref(path: string, page?: number | null): string {
  const q = new URLSearchParams({ path });
  if (page) q.set("page", String(page));
  return `/view?${q.toString()}`;
}

/**
 * Highlighted HTML split into lines, re-opening any span that a line
 * break cuts through (a multi-line comment or string), so every line is
 * well-formed on its own and can sit in its own row beside its number.
 */
export function splitHighlighted(html: string): string[] {
  const out: string[] = [];
  const open: string[] = [];
  for (const raw of html.split("\n")) {
    let line = open.join("") + raw;
    for (const m of raw.matchAll(/<span[^>]*>|<\/span>/g)) {
      if (m[0] === "</span>") open.pop();
      else open.push(m[0]);
    }
    line += "</span>".repeat(open.length);
    out.push(line);
  }
  return out;
}

/**
 * A CSV (or, with `sep = "\t"`, TSV) as rows of cells. Quoted fields may
 * hold the separator, newlines and doubled quotes ("" is one "), which is
 * all Excel writes. Trailing empty lines are dropped.
 */
export function parseDelimited(text: string, sep = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  while (rows.length && rows[rows.length - 1].every((c) => c === "")) rows.pop();
  return rows;
}

/** Spreadsheet column letters: 0 → A, 25 → Z, 26 → AA. */
export function columnName(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/**
 * Trim a sheet to what holds something: rows and columns past the last
 * filled cell go (spreadsheets often "use" thousands of blank ones).
 */
export function trimSheet<T>(rows: (T | null | undefined | "")[][]): (T | null | undefined | "")[][] {
  const filled = (v: unknown) => v !== null && v !== undefined && v !== "";
  let lastRow = -1;
  let lastCol = -1;
  rows.forEach((r, i) =>
    r.forEach((v, j) => {
      if (filled(v)) {
        lastRow = Math.max(lastRow, i);
        lastCol = Math.max(lastCol, j);
      }
    })
  );
  return rows.slice(0, lastRow + 1).map((r) => Array.from({ length: lastCol + 1 }, (_, j) => r[j] ?? null));
}
