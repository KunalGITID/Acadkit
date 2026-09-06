/**
 * The SRM portal parser.
 *
 * Extracted from the bookmarklet so the app can use it too: the
 * bookmarklet only runs on a desktop browser, which is not the device
 * anyone carries, so a phone had no way to refresh from the portal at
 * all. One parser, two callers — the bookmarklet scraping a live page,
 * and the app parsing markup pasted out of Safari.
 *
 * Everything here is pure and DOM-reading: hand it tables, get rows
 * back. The bookmarklet keeps the parts that touch a live page (opening
 * modals, the preview panel, posting to the ingest function).
 *
 * Matching is on HEADER TEXT, never DOM paths, because these portals
 * regenerate class names between deploys. Ambiguous markup yields
 * nothing rather than a guess: reporting no marks beats writing a wrong
 * one into someone's grade projection.
 */

export interface PortalAttendanceRow {
  subject_code: string;
  conducted: number;
  absent: number;
  percentage: number | null;
}

export interface PortalMarkRow {
  subject_code: string;
  label: string;
  max_marks: number;
  marks_obtained: number;
  component_type: string;
}

// ---------- text primitives ----------

/** Collapse whitespace, including the non-breaking spaces these pages are full of. */
export function norm(s: unknown): string {
  return String(s == null ? "" : s)
    // Escaped rather than literal: an invisible U+00A0 in the source
    // reads as a plain space to anyone reviewing it, and this is
    // load-bearing — the portal pads every cell with them.
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function low(s: unknown): string {
  return norm(s).toLowerCase();
}

export function num(s: unknown): number | null {
  const m = norm(s).match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

/** Every table across a set of documents, in order. */
export function tablesIn(docs: Array<Document | Element>): Element[] {
  const out: Element[] = [];
  for (const doc of docs) {
    const found = doc.querySelectorAll("table");
    for (let i = 0; i < found.length; i++) out.push(found[i]);
  }
  return out;
}

// ---------- table primitives ----------

/** Direct element children of `el` whose tag is in `tags`. */
function kids(el: Element, tags: string[]): Element[] {
  const out: Element[] = [];
  const children = el.children;
  for (let i = 0; i < children.length; i++) {
    if (tags.indexOf(children[i].tagName.toLowerCase()) > -1) out.push(children[i]);
  }
  return out;
}

/**
 * A table's own rows, in document order, walking children explicitly
 * rather than using `table.rows` — that property would also hand back
 * rows belonging to tables nested inside a cell, which the marks report
 * is full of.
 */
export function rowsOf(table: Element): Element[] {
  const out: Element[] = [];
  const children = table.children;
  for (let i = 0; i < children.length; i++) {
    const tag = children[i].tagName.toLowerCase();
    if (tag === "tr") out.push(children[i]);
    else if (tag === "thead" || tag === "tbody" || tag === "tfoot") {
      for (const tr of kids(children[i], ["tr"])) out.push(tr);
    }
  }
  return out;
}

export function cellsOf(tr: Element): Element[] {
  return kids(tr, ["td", "th"]);
}

/** Header labels for a table: <thead> cells, else the first row. */
export function headersOf(table: Element): string[] {
  const head = kids(table, ["thead"])[0];
  const row = head ? kids(head, ["tr"])[0] : rowsOf(table)[0];
  if (!row) return [];
  return cellsOf(row).map((c) => low(c.textContent));
}

/**
 * Index of the first header matching `re`, or -1. `not` skips headers
 * that would otherwise be claimed by a broader pattern — "Total Hours
 * Absent" reads as both a conducted and an absent column otherwise.
 */
function col(hs: string[], re: RegExp, not?: RegExp): number {
  for (let i = 0; i < hs.length; i++) {
    if (not && not.test(hs[i])) continue;
    if (re.test(hs[i])) return i;
  }
  return -1;
}

/** Body rows, skipping the row that was consumed as the header. */
function bodyRows(table: Element): Element[] {
  const all = rowsOf(table);
  const head = kids(table, ["thead"])[0];
  if (head) return all.slice(kids(head, ["tr"]).length);
  return all.slice(1);
}

// ---------- attendance ----------

const RE_CODE = /course\s*code|subject\s*code|^code$/;
const RE_CONDUCTED = /conducted|max.*hour|total\s*(?:class|hour)/;
const RE_ABSENT = /absent/;
/** Some portals report classes attended instead of missed; absences are then conducted − present. */
const RE_PRESENT = /present|attended/;
const RE_PCT = /%|percent/;

export function scrapeAttendance(all: Element[]): PortalAttendanceRow[] {
  for (const table of all) {
    const hs = headersOf(table);
    const iCode = col(hs, RE_CODE);
    const iCond = col(hs, RE_CONDUCTED, RE_ABSENT);
    const iAbs = col(hs, RE_ABSENT);
    const iPres = iAbs < 0 ? col(hs, RE_PRESENT) : -1;
    if (iCode < 0 || iCond < 0 || (iAbs < 0 && iPres < 0)) continue;

    const iPct = col(hs, RE_PCT);
    const out: PortalAttendanceRow[] = [];
    for (const row of bodyRows(table)) {
      const c = cellsOf(row);
      if (!c || c.length <= Math.max(iCode, iCond, iAbs, iPres)) continue;
      const code = norm(c[iCode].textContent).toUpperCase();
      const conducted = num(c[iCond].textContent);
      let absent: number | null;
      if (iAbs >= 0) {
        absent = num(c[iAbs].textContent);
      } else {
        const present = num(c[iPres].textContent);
        absent = present === null || conducted === null ? null : conducted - present;
      }
      if (!code || conducted === null || absent === null || absent < 0) continue;
      out.push({
        subject_code: code,
        conducted,
        absent,
        percentage: iPct >= 0 && c[iPct] ? num(c[iPct].textContent) : null,
      });
    }
    if (out.length) return out;
  }
  return [];
}

// ---------- marks ----------

const RE_PERF = /test\s*performance|performance|marks?\b/;

export function classify(label: string): string {
  const l = low(label);
  if (/^(ct|pt|cycle|periodical|unit\s*test)/.test(l)) return "CT";
  if (/lab|practical|experiment/.test(l)) return "Lab";
  if (/assign|hw|homework/.test(l)) return "Assignment";
  if (/project|model|mini/.test(l)) return "Project";
  return "CT";
}

/** "CT1/50.00" -> { label: "CT1", max: 50 }, else null. */
function splitHead(text: unknown): { label: string; max: number } | null {
  const m = norm(text).match(/^(.+?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const label = norm(m[1]);
  if (!label) return null;
  return { label, max: parseFloat(m[2]) };
}

/**
 * A performance cell holds one mini-table per test: a header cell
 * "CT1/50.00" over a value cell "34.00". Absent shows as "Abs".
 */
function parsePerf(cell: Element): Array<{ label: string; max: number; obtained: number }> {
  const out: Array<{ label: string; max: number; obtained: number }> = [];
  const nested = cell.querySelectorAll("table");
  for (let n = 0; n < nested.length; n++) {
    const rows = rowsOf(nested[n]);
    if (rows.length < 2) continue;
    const heads = cellsOf(rows[0]);
    const vals = cellsOf(rows[1]);
    for (let i = 0; i < heads.length; i++) {
      const h = splitHead(heads[i].textContent);
      if (!h || i >= vals.length) continue;
      const raw = norm(vals[i].textContent);
      const obtained = /^abs/i.test(raw) ? 0 : num(raw);
      if (obtained === null) continue;
      out.push({ label: h.label, max: h.max, obtained });
    }
  }
  if (out.length) return out;

  // Fallback for flat markup. Requires whitespace between max and
  // obtained — without it "50.0034.00" is genuinely ambiguous, and
  // reporting nothing beats writing a wrong mark.
  const re = /([A-Za-z][A-Za-z0-9 ._-]{0,23}?)\s*\/\s*(\d+(?:\.\d+)?)\s+(Abs(?:ent)?|\d+(?:\.\d+)?)/gi;
  const text = norm(cell.textContent);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push({
      label: norm(m[1]),
      max: parseFloat(m[2]),
      obtained: /^abs/i.test(m[3]) ? 0 : parseFloat(m[3]),
    });
  }
  return out;
}

export function scrapeMarks(all: Element[]): PortalMarkRow[] {
  for (const table of all) {
    const hs = headersOf(table);
    const iCode = col(hs, RE_CODE);
    const iPerf = col(hs, RE_PERF);
    // Skip the attendance table, which also has a course-code column.
    if (iCode < 0 || iPerf < 0 || col(hs, RE_CONDUCTED, RE_ABSENT) >= 0) continue;
    if (col(hs, RE_ABSENT) >= 0 || col(hs, RE_PRESENT) >= 0) continue;

    const out: PortalMarkRow[] = [];
    for (const row of bodyRows(table)) {
      const c = cellsOf(row);
      if (!c || c.length <= Math.max(iCode, iPerf)) continue;
      const code = norm(c[iCode].textContent).toUpperCase();
      if (!code) continue;
      for (const t of parsePerf(c[iPerf])) {
        out.push({
          subject_code: code,
          label: t.label,
          max_marks: t.max,
          marks_obtained: t.obtained,
          component_type: classify(t.label),
        });
      }
    }
    if (out.length) return out;
  }
  return [];
}

// ---------- component-wise marks ----------

// sp.srmist.edu.in splits marks across two views: a summary table with
// one combined "2.00 / 5.00" total per subject, and a modal — one per
// subject, behind a "View Details" button — holding the labelled
// components. The summary alone is not enough: a total is not a test.

const RE_COMPONENT = /^component$/;
const RE_MARK_PAIR = /mark\s*\/\s*max/;
export const RE_DETAIL_BTN = "button[onclick*='ComponentWiseMarks']";

/** "2.00 / 5.00" -> { obtained: 2, max: 5 }. "Abs" counts as 0. */
export function splitPair(text: unknown): { obtained: number; max: number } | null {
  const m = norm(text).match(/^(Abs(?:ent)?|\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/i);
  if (!m) return null;
  return {
    obtained: /^abs/i.test(m[1]) ? 0 : parseFloat(m[1]),
    max: parseFloat(m[2]),
  };
}

/**
 * The component modal: "Entered on | Component | Mark / Max. Mark".
 * The subject is the row that opened the modal, not a column, so the
 * code is passed in rather than read off the table.
 */
export function scrapeComponents(all: Element[], code: string): PortalMarkRow[] {
  for (const table of all) {
    const hs = headersOf(table);
    const iComp = col(hs, RE_COMPONENT);
    const iPair = col(hs, RE_MARK_PAIR);
    if (iComp < 0 || iPair < 0) continue;

    const out: PortalMarkRow[] = [];
    for (const row of bodyRows(table)) {
      const c = cellsOf(row);
      if (!c || c.length <= Math.max(iComp, iPair)) continue;
      const label = norm(c[iComp].textContent);
      const pair = splitPair(c[iPair].textContent);
      if (!label || !pair) continue;
      out.push({
        subject_code: code,
        label,
        max_marks: pair.max,
        marks_obtained: pair.obtained,
        component_type: classify(label),
      });
    }
    if (out.length) return out;
  }
  return [];
}

/** The summary table whose rows carry a "View Details" button. */
export function findDetailTable(
  all: Element[]
): { table: Element; iCode: number } | null {
  for (const table of all) {
    const iCode = col(headersOf(table), RE_CODE);
    if (iCode < 0) continue;
    if (!table.querySelector(RE_DETAIL_BTN)) continue;
    return { table, iCode };
  }
  return null;
}

// ---------- diagnostics ----------

/**
 * What the parser could see, for a human to read.
 *
 * Shared with the app, not only the bookmarklet's capture mode: when a
 * paste yields nothing, "no tables found" is a dead end, while a dump
 * naming the containers that *were* there is how the parser gets taught
 * a portal it doesn't recognise yet.
 */
const clip = (t: unknown): string => {
  const s = norm(t);
  return s.length > 60 ? s.slice(0, 60) + "…" : s;
};

export interface GridReport {
  container: string;
  rowSignature: string;
  rowCount: number;
  sample: string[][];
}

/**
 * Repeating non-table structures. A report laid out in divs otherwise
 * dumps `tables: []` and tells you only that the parser failed, not
 * what the markup actually is.
 */
export function gridsIn(docs: Array<Document | Element>): GridReport[] {
  const out: GridReport[] = [];
  const sig = (el: Element) =>
    el.tagName.toLowerCase() + "." + norm(el.className || "").replace(/\s+/g, ".");

  for (const doc of docs) {
    if (out.length >= 12) break;
    const nodes = doc.querySelectorAll(
      "[role=grid],[role=table],[role=rowgroup],div,ul,ol,section"
    );
    for (let i = 0; i < nodes.length && out.length < 12; i++) {
      const children = nodes[i].children;
      if (children.length < 3) continue;
      const first = sig(children[0]);
      if (!first) continue;
      let same = 0;
      for (let c = 0; c < children.length; c++) if (sig(children[c]) === first) same++;
      if (same < 3 || same < children.length - 1) continue;
      if (children[0].children.length < 2) continue;
      // Skip a container whose repetition is inherited from a child that
      // already qualified — the outermost match describes it better.
      if (nodes[i].querySelector("table")) continue;

      const rows: string[][] = [];
      for (let r = 0; r < Math.min(3, children.length); r++) {
        const cells = children[r].children;
        const line: string[] = [];
        for (let k = 0; k < cells.length; k++) line.push(clip(cells[k].textContent));
        rows.push(line);
      }
      out.push({ container: sig(nodes[i]), rowSignature: first, rowCount: same, sample: rows });
    }
  }
  return out;
}

export interface DiagnosticContext {
  url: string;
  hash: string;
  title: string;
  documents: number;
  blockedFrames: number;
}

export function diagnose(
  docs: Array<Document | Element>,
  all: Element[],
  context: DiagnosticContext
): string {
  const tables = all.map((table, index) => {
    const rows = bodyRows(table);
    const sample: string[][] = [];
    for (let r = 0; r < Math.min(2, rows.length); r++) {
      sample.push(cellsOf(rows[r]).map((c) => clip(c.textContent)));
    }
    return {
      index,
      headers: headersOf(table),
      rowCount: rows.length,
      nestedTables: table.querySelectorAll("table").length,
      sample,
    };
  });
  return JSON.stringify({ ...context, tables, grids: gridsIn(docs) }, null, 1);
}
