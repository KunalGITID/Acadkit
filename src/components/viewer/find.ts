import { findAll, normaliseQuery } from "@/lib/textSearch";

/** Find-in-file, over whatever a renderer drew. */
export interface Finder {
  /** Look for `query`; resolves to how many matches there are. */
  search(query: string): Promise<number>;
  /** Scroll to match `i` and mark it as the current one. */
  show(i: number): void;
  /** Where each match sits, 0 (top) to 1 (bottom), for the match rail. */
  marks(): number[];
  clear(): void;
  dispose(): void;
}

const ALL = "viewer-find";
const CURRENT = "viewer-find-current";

type HighlightCtor = new (...ranges: Range[]) => unknown;
function registry(): { set(k: string, v: unknown): void; delete(k: string): void } | null {
  const css = (globalThis as { CSS?: { highlights?: unknown } }).CSS;
  const H = (globalThis as { Highlight?: HighlightCtor }).Highlight;
  return css?.highlights && H ? (css.highlights as ReturnType<typeof registry>) : null;
}

function paint(all: Range[], current: Range | null) {
  const reg = registry();
  const H = (globalThis as { Highlight?: HighlightCtor }).Highlight;
  if (!reg || !H) return;
  reg.set(ALL, new H(...all));
  if (current) reg.set(CURRENT, new H(current));
  else reg.delete(CURRENT);
}

function unpaint() {
  const reg = registry();
  reg?.delete(ALL);
  reg?.delete(CURRENT);
}

/** Elements whose text reads as separate from what's around it. */
const BLOCK = new Set([
  "P", "DIV", "LI", "TR", "TD", "TH", "SECTION", "ARTICLE", "TABLE", "TBODY", "THEAD",
  "H1", "H2", "H3", "H4", "H5", "H6", "PRE", "BLOCKQUOTE", "HEADER", "FOOTER",
]);

interface Piece {
  node: Text;
  start: number;
}

/** The text under `root` as one string, with where each text node starts. */
export function collectText(root: Node): { text: string; pieces: Piece[] } {
  const pieces: Piece[] = [];
  let text = "";
  const walk = (n: Node) => {
    for (let c = n.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === Node.TEXT_NODE) {
        pieces.push({ node: c as Text, start: text.length });
        text += (c as Text).data;
      } else if (c.nodeType === Node.ELEMENT_NODE) {
        const el = c as HTMLElement;
        const tag = el.tagName;
        if (tag === "BR") {
          text += " ";
          continue;
        }
        if (tag === "STYLE" || tag === "SCRIPT" || tag === "BUTTON" || tag === "CANVAS" || el.dataset.findSkip != null) continue;
        const block = BLOCK.has(tag);
        if (block) text += " ";
        walk(el);
        if (block) text += " ";
      }
    }
  };
  walk(root);
  return { text, pieces };
}

/** The DOM position of text offset `pos`; `end` asks for the end of a range. */
function locate(pieces: Piece[], pos: number, end: boolean): [Text, number] | null {
  // Last piece starting at or before pos.
  let lo = 0;
  let hi = pieces.length - 1;
  let at = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (pieces[mid].start <= pos) {
      at = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (end) {
    // An end sits inside the piece it closes, or at the end of the one before a gap.
    for (let i = at; i >= 0; i--) {
      const p = pieces[i];
      if (p.start < pos || (p.start === pos && p.node.data.length === 0)) {
        return [p.node, Math.min(pos - p.start, p.node.data.length)];
      }
    }
    return null;
  }
  if (at >= 0 && pos < pieces[at].start + pieces[at].node.data.length) return [pieces[at].node, pos - pieces[at].start];
  // In a gap (a virtual space): start at the next real text.
  const next = pieces[at + 1];
  return next ? [next.node, 0] : null;
}

/** Ranges for every match of `query` in the text under `root`. */
export function rangesIn(root: Node, query: string): Range[] {
  const { text, pieces } = collectText(root);
  const out: Range[] = [];
  for (const m of findAll(text, query)) {
    const a = locate(pieces, m.start, false);
    const b = locate(pieces, m.end, true);
    if (!a || !b) continue;
    const r = document.createRange();
    try {
      r.setStart(a[0], a[1]);
      r.setEnd(b[0], b[1]);
    } catch {
      continue;
    }
    if (!r.collapsed) out.push(r);
  }
  return out;
}

/** Bring a range into view: the pane scrolls, and so does any sideways-scrolling box it's in. */
export function reveal(range: Range, scroller: HTMLElement) {
  const r = range.getBoundingClientRect();
  const inner = (range.startContainer.parentElement as HTMLElement | null)?.closest<HTMLElement>(".overflow-x-auto");
  if (inner && inner !== scroller && inner.scrollWidth > inner.clientWidth) {
    const ib = inner.getBoundingClientRect();
    const k = ib.width / (inner.offsetWidth || 1);
    if (r.left < ib.left || r.right > ib.right) {
      inner.scrollLeft += (r.left - ib.left) / k - inner.clientWidth * 0.3;
    }
  }
  const b = scroller.getBoundingClientRect();
  const after = range.getBoundingClientRect();
  let left = scroller.scrollLeft;
  if (after.left < b.left || after.right > b.right) left += after.left - b.left - scroller.clientWidth * 0.3;
  scroller.scrollTo({ top: scroller.scrollTop + (after.top - b.top) - scroller.clientHeight * 0.35, left, behavior: "smooth" });
}

function fraction(r: Range, root: HTMLElement): number {
  const box = root.getBoundingClientRect();
  const at = r.getBoundingClientRect();
  return box.height > 0 ? Math.min(1, Math.max(0, (at.top - box.top) / box.height)) : 0;
}

/**
 * Re-run `refresh` a moment after the content changes - a deck redrawn at
 * a new width, a PDF page drawing its text layer - so highlights follow.
 */
function watch(root: HTMLElement, refresh: () => void): () => void {
  let t = 0;
  const mo = new MutationObserver(() => {
    clearTimeout(t);
    t = window.setTimeout(refresh, 150);
  });
  mo.observe(root, { childList: true, subtree: true, characterData: true });
  return () => {
    clearTimeout(t);
    mo.disconnect();
  };
}

/** Find over a rendered document: docx, slides, code, text, sheets. */
export function createDomFinder(root: HTMLElement, scroller: HTMLElement): Finder {
  let query = "";
  let ranges: Range[] = [];
  let current = -1;
  const refresh = () => {
    if (!query) return;
    ranges = rangesIn(root, query);
    if (current >= ranges.length) current = ranges.length - 1;
    paint(ranges, ranges[current] ?? null);
  };
  const stop = watch(root, refresh);
  return {
    async search(q) {
      query = normaliseQuery(q) ? q : "";
      current = -1;
      if (!query) {
        ranges = [];
        unpaint();
        return 0;
      }
      ranges = rangesIn(root, query);
      paint(ranges, null);
      return ranges.length;
    },
    show(i) {
      current = i;
      const r = ranges[i];
      paint(ranges, r ?? null);
      if (r) reveal(r, scroller);
    },
    marks() {
      return ranges.slice(0, 400).map((r) => fraction(r, root));
    },
    clear() {
      query = "";
      ranges = [];
      current = -1;
      unpaint();
    },
    dispose() {
      stop();
      unpaint();
    },
  };
}

/** One PDF page's text, as the text layer will draw it, with where each item sits. */
export interface PdfPageText {
  text: string;
  /** For each text item: where it starts in `text`, and its height down the page (0–1). */
  items: Array<{ start: number; y: number }>;
}

/**
 * Find over a PDF. Only pages near the screen are drawn (and have a text
 * layer to highlight), so the count and the rail come from every page's
 * text, read through pdf.js; highlighting follows as pages draw.
 */
export function createPdfFinder({
  root,
  scroller,
  pages,
  pageText,
}: {
  root: HTMLElement;
  scroller: HTMLElement;
  pages: number;
  pageText: (n: number) => Promise<PdfPageText>;
}): Finder {
  let query = "";
  let hits: Array<{ page: number; k: number; y: number }> = [];
  let current = -1;
  let run = 0;

  const refresh = () => {
    if (!query) return;
    const all: Range[] = [];
    let cur: Range | null = null;
    const hit = hits[current];
    for (const layer of root.querySelectorAll<HTMLElement>(".textLayer")) {
      const n = Number(layer.dataset.page);
      const rs = rangesIn(layer, query);
      all.push(...rs);
      if (hit && hit.page === n) cur = rs[hit.k] ?? null;
    }
    paint(all, cur);
  };
  const stop = watch(root, refresh);

  return {
    async search(q) {
      const mine = ++run;
      query = normaliseQuery(q) ? q : "";
      current = -1;
      hits = [];
      if (!query) {
        unpaint();
        return 0;
      }
      const found: typeof hits = [];
      for (let n = 1; n <= pages; n++) {
        const pt = await pageText(n);
        if (mine !== run) return 0; // a newer search started
        findAll(pt.text, query).forEach((m, k) => {
          let y = 0;
          for (const it of pt.items) {
            if (it.start > m.start) break;
            y = it.y;
          }
          found.push({ page: n, k, y });
        });
      }
      hits = found;
      refresh();
      return hits.length;
    },
    show(i) {
      current = i;
      const hit = hits[i];
      if (!hit) return;
      const page = document.getElementById(`pdf-page-${hit.page}`);
      if (page) {
        const b = scroller.getBoundingClientRect();
        const p = page.getBoundingClientRect();
        scroller.scrollTo({
          top: scroller.scrollTop + (p.top - b.top) + hit.y * p.height - scroller.clientHeight * 0.35,
          behavior: "smooth",
        });
      }
      refresh();
    },
    marks() {
      return hits.slice(0, 400).map((h) => (h.page - 1 + h.y) / pages);
    },
    clear() {
      run++;
      query = "";
      hits = [];
      current = -1;
      unpaint();
    },
    dispose() {
      run++;
      stop();
      unpaint();
    },
  };
}
