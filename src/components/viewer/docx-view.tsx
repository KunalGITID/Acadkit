import { useEffect, useRef, useState } from "react";

/**
 * A Word document, laid out as Word would: page by page on white paper,
 * scaled down to the viewer's width so a phone sees whole pages without
 * scrolling sideways, and at full size where the screen has room.
 */
export default function DocxView({ blob }: { blob: Blob }) {
  const host = useRef<HTMLDivElement>(null);
  const styles = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | string>("loading");
  const [scale, setScale] = useState(1);
  const [naturalHeight, setNaturalHeight] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { renderAsync } = await import("docx-preview");
        if (!host.current || !styles.current) return;
        host.current.innerHTML = "";
        await renderAsync(blob, host.current, styles.current, {
          inWrapper: true,
          breakPages: true,
          ignoreLastRenderedPageBreak: false,
          renderHeaders: true,
          renderFooters: true,
          useBase64URL: true,
          className: "docx",
        });
        if (!cancelled) setState("ready");
      } catch (e) {
        if (!cancelled) setState(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [blob]);

  // Fit the rendered pages to the width available, and keep fitting as it changes.
  useEffect(() => {
    if (state !== "ready") return;
    const outer = host.current?.parentElement?.parentElement;
    const page = host.current?.querySelector<HTMLElement>("section.docx");
    if (!outer || !page || !host.current) return;
    const fit = () => {
      const available = outer.clientWidth;
      const natural = page.offsetWidth + 16;
      const s = Math.min(1, available / natural);
      setScale(s);
      setNaturalHeight(host.current!.scrollHeight);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(outer);
    return () => ro.disconnect();
  }, [state]);

  return (
    <div className="w-full">
      <div ref={styles} />
      {state === "loading" && <p className="py-16 text-center text-sm font-medium text-muted">Opening…</p>}
      {state !== "loading" && state !== "ready" && (
        <p className="px-4 py-10 text-center text-sm font-medium text-muted">Couldn't open this document: {state}</p>
      )}
      <div className="overflow-hidden pb-16" style={{ height: naturalHeight ? naturalHeight * scale + 64 : undefined }}>
        <div
          ref={host}
          className="docx-host origin-top-left"
          style={{ transform: `scale(${scale})`, width: scale < 1 ? `${100 / scale}%` : undefined }}
        />
      </div>
    </div>
  );
}
