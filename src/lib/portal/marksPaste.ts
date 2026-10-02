import {
  bodyRows,
  cellsOf,
  headersOf,
  isComponentTable,
  norm,
  scrapeComponents,
  splitPair,
  type PortalMarkRow,
} from "@/lib/portal/parse";
import { inferType } from "@/lib/plan";

// sp.srmist.edu.in shows marks in two places: the "Internal Mark Details"
// summary (one "9.60 / 20.00" total per subject) and a "View Details" popup
// per subject ("Entered on | Component | Mark / Max. Mark"). Whatever of
// those gets pasted - one popup, several, the summary, or the plain text a
// phone's clipboard flattens them to - should land on the right subjects.

/** "21CSS202T", "21MAB201T", "21LEM201T", "21CSC206P". */
const CODE = String.raw`\d{2}[A-Z]{2,4}\d{3}[A-Z]?`;
const RE_CODE_ANYWHERE = new RegExp(String.raw`\b(${CODE})\b`, "g");
const NUM = String.raw`\d+(?:\.\d+)?`;

/** First line of what the "Copy all marks" bookmarklet puts on the clipboard. */
export const COPY_HEADER = "AcadKit marks v1";

/** A subject's combined internal total, as the summary table states it. */
export interface PortalMarkTotal {
  subject_code: string;
  obtained: number;
  max: number;
}

export interface PastedMarks {
  /** Components with their subject known. */
  marks: PortalMarkRow[];
  /** Components from a popup pasted without its title - the subject has to be asked. */
  uncoded: PortalMarkRow[];
  /** Per-subject totals from the summary page. */
  totals: PortalMarkTotal[];
}

const empty = (): PastedMarks => ({ marks: [], uncoded: [], totals: [] });

function component(code: string, label: string, obtained: number, max: number): PortalMarkRow {
  return { subject_code: code, label, marks_obtained: obtained, max_marks: max, component_type: inferType(label) };
}

// ---------- pasted markup ----------

/** The summary table: a code column and a "Mark / Max. Mark" column, but no component column. */
export function scrapeMarkTotals(all: Element[]): PortalMarkTotal[] {
  for (const table of all) {
    if (isComponentTable(table)) continue;
    const hs = headersOf(table);
    const iCode = hs.findIndex((h) => /^(course\s*|subject\s*)?code$/.test(h));
    const iPair = hs.findIndex((h) => /mark\s*\/\s*max/.test(h));
    if (iCode < 0 || iPair < 0) continue;
    const out: PortalMarkTotal[] = [];
    for (const row of bodyRows(table)) {
      const c = cellsOf(row);
      if (!c || c.length <= Math.max(iCode, iPair)) continue;
      const code = norm(c[iCode].textContent).toUpperCase();
      const pair = splitPair(c[iPair].textContent);
      if (code && pair) out.push({ subject_code: code, ...pair });
    }
    if (out.length) return out;
  }
  return [];
}

/**
 * Popup tables, one or many. A popup's subject is in its title
 * ("21CSS202T - FUNDAMENTALS OF DATA SCIENCE"), not in the table, so each
 * table takes the last course code written before it outside any table -
 * codes inside the summary table name rows, not the popup.
 */
export function scrapePopups(doc: Document, all: Element[]): Pick<PastedMarks, "marks" | "uncoded"> {
  const out: Pick<PastedMarks, "marks" | "uncoded"> = { marks: [], uncoded: [] };
  const popups = all.filter(isComponentTable);
  if (!popups.length) return out;

  const headings: Array<{ node: Node; code: string }> = [];
  const walk = doc.createTreeWalker(doc.body ?? doc, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    if (n.parentElement?.closest("table")) continue;
    const codes = norm(n.textContent).match(RE_CODE_ANYWHERE);
    if (codes) headings.push({ node: n, code: codes[codes.length - 1] });
  }

  for (const table of popups) {
    const before = headings.filter((h) => h.node.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING);
    const code = before.length ? before[before.length - 1].code : "";
    const rows = scrapeComponents([table], code || "?");
    if (code) out.marks.push(...rows);
    else out.uncoded.push(...rows.map((r) => ({ ...r, subject_code: "" })));
  }
  return out;
}

// ---------- pasted text ----------

/**
 * Plain text: what iOS gives for a copied page, and what the bookmarklet
 * writes. Read as a stream of tokens, because a phone may break a table
 * row across lines or run its cells together:
 *   "21CSS202T - FUNDAMENTALS…"         a popup title: the subject for what follows
 *   "31/Aug/2026 FT-I 2.00 / 5.00"      a component of that subject
 *   "21CSS202T FUNDAMENTALS… 9.60 / 20.00"  a summary row: that subject's total
 * and the bookmarklet's own lines, "21CSS202T<TAB>FT-I<TAB>2<TAB>5".
 */
export function parseMarksText(text: string): PastedMarks {
  const out = empty();
  const lines = text.replace(/\u00a0/g, " ").split(/\r?\n/);

  if (lines[0]?.trim() === COPY_HEADER) {
    const row = new RegExp(String.raw`^(${CODE})\t([^\t]+)\t(${NUM}|Abs(?:ent)?)\t(${NUM})$`, "i");
    for (const line of lines.slice(1)) {
      const m = row.exec(line.trim());
      if (m) out.marks.push(component(m[1].toUpperCase(), norm(m[2]), /^abs/i.test(m[3]) ? 0 : parseFloat(m[3]), parseFloat(m[4])));
    }
    return out;
  }

  const flat = norm(lines.join(" "));
  const token = new RegExp(
    String.raw`(${CODE})(\s*-\s*)?|(\d{1,2}[/-][A-Za-z]{3}[/-]\d{4})|(Abs(?:ent)?|${NUM})\s*\/\s*(${NUM})`,
    "g"
  );
  let current = ""; // the popup whose components are being read
  let pending: { kind: "total"; code: string } | { kind: "component" } | null = null;
  let words = "";
  let last = 0;
  for (let m = token.exec(flat); m; m = token.exec(flat)) {
    words += flat.slice(last, m.index);
    last = token.lastIndex;
    if (m[1]) {
      if (m[2]) {
        current = m[1].toUpperCase(); // "CODE - TITLE": a popup
        pending = null;
      } else {
        pending = { kind: "total", code: m[1].toUpperCase() }; // a summary row
      }
      words = "";
    } else if (m[3]) {
      pending = { kind: "component" };
      words = "";
    } else if (m[4] !== undefined && pending) {
      const obtained = /^abs/i.test(m[4]) ? 0 : parseFloat(m[4]);
      const max = parseFloat(m[5]);
      if (pending.kind === "total") {
        out.totals.push({ subject_code: pending.code, obtained, max });
      } else {
        const label = norm(words).replace(/^(entered on|component|mark\s*\/\s*max\.?\s*mark)\s*/gi, "");
        if (label) {
          const row = component(current, label, obtained, max);
          if (current) out.marks.push(row);
          else out.uncoded.push(row);
        }
      }
      pending = null;
      words = "";
    }
  }
  return out;
}

/** True when a plain-text paste holds any marks this module can read. */
export function hasMarks(p: PastedMarks): boolean {
  return p.marks.length > 0 || p.uncoded.length > 0 || p.totals.length > 0;
}
