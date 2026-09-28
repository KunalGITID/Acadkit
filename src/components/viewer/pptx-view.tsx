import { useEffect, useRef, useState } from "react";

/** A PowerPoint deck as a column of slides, each drawn at the viewer's width - one slide a screen on a phone, big on a MacBook. */
export default function PptxView({ blob }: { blob: Blob }) {
  const box = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | string>("loading");
  const [data, setData] = useState<ArrayBuffer | null>(null);

  useEffect(() => {
    let cancelled = false;
    void blob.arrayBuffer().then((b) => !cancelled && setData(b));
    return () => {
      cancelled = true;
    };
  }, [blob]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!data || !width || !host.current) return;
    let cancelled = false;
    // Only redraw once the width settles: a resize fires many times.
    const t = setTimeout(async () => {
      try {
        const { init } = await import("pptx-preview");
        if (cancelled || !host.current) return;
        host.current.innerHTML = "";
        const viewer = init(host.current, { width, height: Math.round((width * 9) / 16), mode: "list" });
        // The renderer consumes the buffer; hand it a copy so a redraw can reuse the original.
        await viewer.preview(data.slice(0));
        if (!cancelled) setState("ready");
      } catch (e) {
        if (!cancelled) setState(e instanceof Error ? e.message : String(e));
      }
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [data, width]);

  return (
    <div ref={box} className="w-full pb-16">
      {state === "loading" && <p className="py-16 text-center text-sm font-medium text-muted">Opening…</p>}
      {state !== "loading" && state !== "ready" && (
        <p className="px-4 py-10 text-center text-sm font-medium text-muted">Couldn't open these slides: {state}</p>
      )}
      <div ref={host} className="pptx-host" />
    </div>
  );
}
