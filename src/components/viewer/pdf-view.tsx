import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import type { TextContent, TextItem } from "pdfjs-dist/types/src/display/api";
import { createPdfFinder, type Finder, type PdfPageText } from "@/components/viewer/find";
import { pdfEngine } from "@/components/viewer/pdf-engine";

type PdfLib = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

/** A PDF laid out to the screen: every page `width` wide (the zoom pane multiplies it when you zoom), drawn only as it nears the screen, at the display's own pixel density so text stays sharp on a Retina screen. */
export default function PdfView({
  blob,
  startPage,
  width,
  scroller,
  content,
  onPage,
  onFinder,
  onPageWidth,
}: {
  blob: Blob;
  startPage?: number | null;
  width: number;
  scroller: HTMLDivElement | null;
  content: HTMLDivElement | null;
  onPage: (current: number, total: number) => void;
  onFinder: (finder: Finder | null) => void;
  /** Page 1's width in PDF points, once known: the viewer caps its 1× width by it. */
  onPageWidth?: (points: number) => void;
}) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [lib, setLib] = useState<PdfLib | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aspects, setAspects] = useState<number[]>([]);
  // Held in a ref: a new callback must not reload the document.
  const pageWidthCb = useRef(onPageWidth);
  pageWidthCb.current = onPageWidth;
  // Every page's real shape known (a jump deep into the file waits for it).
  const [measured, setMeasured] = useState(false);
  const jumped = useRef(false);

  useEffect(() => {
    let cancelled = false;
    // pdf.js 6 closes a document through the task that loaded it, which also
    // cancels one still loading when the viewer goes away.
    let task: { destroy(): Promise<void> } | null = null;
    (async () => {
      try {
        const { lib: pdfjs, worker } = await pdfEngine();
        if (cancelled) return;
        const loading = pdfjs.getDocument({
          data: new Uint8Array(await blob.arrayBuffer()),
          worker,
          // The image decoders pdf.js loads on demand (vite.config.ts,
          // pdfjsWasm). Without them a scan's text masks are dropped.
          wasmUrl: new URL(`${import.meta.env.BASE_URL}pdfjs-wasm/`, window.location.origin).href,
        });
        task = loading;
        const doc: PDFDocumentProxy = await loading.promise;
        if (cancelled) return;
        // On screen as soon as page 1 is measured: the rest are assumed to be its shape (they nearly always are) and measured behind it, in parallel.
        const first = (await doc.getPage(1)).getViewport({ scale: 1 });
        const a1 = first.height / first.width;
        if (cancelled) return;
        pageWidthCb.current?.(first.width);
        setAspects(Array.from({ length: doc.numPages }, () => a1));
        setLib(pdfjs);
        setDoc(doc);
        const shapes = [a1];
        for (let i = 2; i <= doc.numPages; i += 8) {
          const batch = await Promise.all(
            Array.from({ length: Math.min(8, doc.numPages - i + 1) }, (_, j) =>
              doc.getPage(i + j).then((p) => {
                const v = p.getViewport({ scale: 1 });
                return v.height / v.width;
              })
            )
          );
          if (cancelled) return;
          shapes.push(...batch);
        }
        // One re-layout, and only if some page really is another shape.
        if (shapes.some((a) => Math.abs(a - a1) > 0.001)) setAspects(shapes);
        setMeasured(true);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [blob]);

  // Open at the page a search result or a "read" link named.
  useEffect(() => {
    if (!doc || !width || jumped.current || !startPage || (startPage > 1 && !measured)) return;
    jumped.current = true;
    requestAnimationFrame(() =>
      document.getElementById(`pdf-page-${Math.min(startPage, doc.numPages)}`)?.scrollIntoView({ block: "start" })
    );
  }, [doc, width, startPage, measured]);

  // The page under the middle of the box. Worked out from positions rather
  // than intersection ratios: those are measured against the pre-render
  // margin, so a page far below the screen reads as on it.
  useEffect(() => {
    if (!doc || !scroller) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => onPage(pageAtMiddle(scroller, doc.numPages), doc.numPages));
    };
    onScroll();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      scroller.removeEventListener("scroll", onScroll);
    };
  }, [doc, scroller, width, onPage]);

  // Find-in-file: every page's text, read once, for the count and the rail.
  useEffect(() => {
    if (!doc || !scroller || !content) return;
    const cache = new Map<number, Promise<PdfPageText>>();
    const pageText = (n: number) => {
      if (!cache.has(n)) cache.set(n, textContentOf(doc, n).then((tc) => pageTextFrom(doc, n, tc)));
      return cache.get(n)!;
    };
    const finder = createPdfFinder({ root: content, scroller, pages: doc.numPages, pageText });
    onFinder(finder);
    return () => {
      finder.dispose();
      onFinder(null);
    };
  }, [doc, scroller, content, onFinder]);

  if (error) return <p className="px-4 py-10 text-center text-sm font-medium text-muted">Couldn't open this PDF: {error}</p>;
  if (!doc) return <p className="py-16 text-center text-sm font-medium text-muted">Opening…</p>;
  return (
    <div className="space-y-3" style={{ width }}>
      {aspects.map((a, i) => (
        <PdfPage key={i} doc={doc} lib={lib} n={i + 1} width={width} aspect={a} />
      ))}
    </div>
  );
}

/** The page under the middle of the box. */
function pageAtMiddle(scroller: HTMLElement, count: number): number {
  const box = scroller.getBoundingClientRect();
  const mid = box.top + box.height / 2;
  let best = 1;
  let gap = Infinity;
  for (let n = 1; n <= count; n++) {
    const r = document.getElementById(`pdf-page-${n}`)?.getBoundingClientRect();
    if (!r) continue;
    if (r.top <= mid && r.bottom >= mid) return n;
    const d = Math.min(Math.abs(r.top - mid), Math.abs(r.bottom - mid));
    if (d < gap) [best, gap] = [n, d];
    if (r.top > mid) break;
  }
  return best;
}

/** The most pixels one page's canvas may hold. */
const MAX_CANVAS_PIXELS = 8_000_000;

/** One page: a placeholder of the right height, drawn while it's near the screen. */
function PdfPage({
  doc,
  lib,
  n,
  width,
  aspect,
}: {
  doc: PDFDocumentProxy;
  lib: PdfLib | null;
  n: number;
  width: number;
  aspect: number;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const height = Math.round(width * aspect);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => setNear(entries[entries.length - 1].isIntersecting), {
      rootMargin: "1200px 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    if (!near) {
      // Far off screen: give the canvas memory back.
      freeCanvases(el);
      return;
    }
    let task: RenderTask | null = null;
    let cancelled = false;
    (async () => {
      const page = await doc.getPage(n);
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      const css = width / base.width;
      const dpr = Math.min(window.devicePixelRatio || 1, 3, Math.sqrt(MAX_CANVAS_PIXELS / (width * width * aspect)));
      const viewport = page.getViewport({ scale: css * dpr });
      // Drawn off screen and swapped in, so a re-draw at a new zoom shows
      // the old (stretched) page until the sharp one is ready, not white.
      const c = document.createElement("canvas");
      c.width = Math.floor(viewport.width);
      c.height = Math.floor(viewport.height);
      c.className = "block h-full w-full";
      c.setAttribute("aria-label", `Page ${n}`);
      task = page.render({ canvas: c, viewport });
      try {
        await task.promise;
      } catch {
        return;
      }
      if (cancelled || !wrap.current) return;
      // The text layer: invisible text laid exactly over the drawing, so
      // a page's words can be found, highlighted and selected.
      let layer: HTMLDivElement | null = null;
      if (lib) {
        layer = document.createElement("div");
        layer.className = "textLayer";
        layer.dataset.page = String(n);
        layer.style.setProperty("--total-scale-factor", String(css));
        layer.style.setProperty("--scale-round-x", "1px");
        layer.style.setProperty("--scale-round-y", "1px");
        try {
          await new lib.TextLayer({
            textContentSource: await textContentOf(doc, n),
            container: layer,
            viewport: page.getViewport({ scale: css }),
          }).render();
        } catch {
          layer = null;
        }
        if (cancelled || !wrap.current) return;
      }
      freeCanvases(wrap.current);
      wrap.current.querySelector(".textLayer")?.remove();
      wrap.current.appendChild(c);
      if (layer) wrap.current.appendChild(layer);
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [near, doc, lib, n, width, aspect]);

  return (
    <div
      id={`pdf-page-${n}`}
      ref={wrap}
      className="relative scroll-mt-3 overflow-hidden rounded-md bg-white shadow-sm"
      style={{ height }}
    />
  );
}

/** Zero a canvas's size before dropping it: Safari holds the memory otherwise. */
function freeCanvases(el: HTMLElement) {
  for (const c of el.querySelectorAll("canvas")) {
    c.width = 0;
    c.height = 0;
    c.remove();
  }
}

/** A page's text content, fetched once per document and page. */
const textCache = new WeakMap<PDFDocumentProxy, Map<number, Promise<TextContent>>>();
function textContentOf(doc: PDFDocumentProxy, n: number): Promise<TextContent> {
  let m = textCache.get(doc);
  if (!m) textCache.set(doc, (m = new Map()));
  if (!m.has(n)) m.set(n, doc.getPage(n).then((p) => p.getTextContent()));
  return m.get(n)!;
}

/**
 * A page's text the way the text layer draws it - each item's string, a
 * space where a line ends - so a match counted here is the same match
 * found in the page's text layer once it's drawn.
 */
async function pageTextFrom(doc: PDFDocumentProxy, n: number, tc: TextContent): Promise<PdfPageText> {
  const vp = (await doc.getPage(n)).getViewport({ scale: 1 });
  let text = "";
  const items: PdfPageText["items"] = [];
  for (const it of tc.items) {
    if (!("str" in it)) continue;
    const item = it as TextItem;
    const [, y] = vp.convertToViewportPoint(item.transform[4], item.transform[5]);
    items.push({ start: text.length, y: Math.min(1, Math.max(0, y / vp.height)) });
    text += item.str;
    if (item.hasEOL) text += " ";
  }
  return { text, items };
}
