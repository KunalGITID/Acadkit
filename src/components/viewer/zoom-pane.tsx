import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Minus, Plus } from "lucide-react";
import {
  MAX_ZOOM,
  MIN_ZOOM,
  STEP,
  baseUnder,
  centreOffset,
  clampZoom,
  easeToward,
  pinchZoom,
  scrollFor,
  wheelZoom,
} from "@/lib/zoom";

/** The viewer's scroll box, with zoom: two fingers on a phone, a trackpad pinch on a Mac (ctrl + wheel in Chrome, gesture events in Safari), double-tap, or the − / + buttons. */
export function ZoomPane({
  mode,
  maxWidth = 1024,
  pad = 12,
  label,
  className,
  children,
}: {
  mode: "transform" | "layout";
  /** The content's widest at 1× (a MacBook shows a page, not a banner). */
  maxWidth?: number;
  pad?: number;
  /** Shown in the pill beside the zoom, e.g. "3 / 10" for a PDF. */
  label?: ReactNode;
  className?: string;
  children: (ctx: { width: number; scroller: HTMLDivElement | null; content: HTMLDivElement | null }) => ReactNode;
}) {
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const sizer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement | null>(null);
  const [content, setContent] = useState<HTMLDivElement | null>(null);
  const innerRef = useCallback((el: HTMLDivElement | null) => {
    inner.current = el;
    setContent(el);
  }, []);
  const pct = useRef<HTMLSpanElement>(null);
  const [box, setBox] = useState(0);
  // The zoom the layout is built at ("layout" mode only).
  const [committed, setCommitted] = useState(1);
  const [shown, setShown] = useState(1);

  const g = useRef({
    live: 1,
    target: 1,
    active: false,
    focal: { x: 0, y: 0 },
    base: { x: 0, y: 0 },
    nat: { w: 0, h: 0 },
    off: 0,
    raf: 0,
    moving: false,
  });

  const contentWidth = Math.max(0, Math.min(box - 2 * pad, maxWidth));
  const layoutZ = mode === "layout" ? committed : 1;
  const layoutWidth = Math.round(contentWidth * layoutZ);

  /** Draw the current state: transform, box size, and (while zooming) scroll. */
  const apply = useCallback(
    (withScroll: boolean) => {
      const s = g.current;
      const sc = scroller;
      if (!sc || !sizer.current || !inner.current) return;
      const k = s.live / layoutZ;
      const visW = s.nat.w * k;
      const visH = s.nat.h * k;
      const W = sc.clientWidth;
      s.off = centreOffset(W, visW);
      sizer.current.style.width = `${Math.max(W, visW)}px`;
      sizer.current.style.height = `${visH}px`;
      inner.current.style.transform = k === 1 ? "" : `scale(${k})`;
      inner.current.style.left = `${s.off}px`;
      if (withScroll) {
        sc.scrollLeft = scrollFor(s.base.x, s.live, s.off, s.focal.x);
        sc.scrollTop = scrollFor(s.base.y, s.live, 0, s.focal.y);
      }
      if (pct.current) pct.current.textContent = `${Math.round(s.live * 100)}%`;
    },
    [scroller, layoutZ]
  );

  const settle = useCallback(() => {
    const s = g.current;
    s.moving = false;
    if (inner.current) inner.current.style.willChange = "";
    setShown(s.live);
    if (mode === "layout" && Math.abs(s.live - committed) > 0.001) setCommitted(s.live);
  }, [mode, committed]);

  const tick = useCallback(() => {
    const s = g.current;
    s.raf = 0;
    s.live = easeToward(s.live, s.target);
    apply(true);
    if (s.live !== s.target || s.active) {
      s.raf = requestAnimationFrame(tick);
      return;
    }
    // Fingers up and caught up: spring back inside the limits, then rest.
    const inside = clampZoom(s.target);
    if (inside !== s.target) {
      s.target = inside;
      s.raf = requestAnimationFrame(tick);
      return;
    }
    settle();
  }, [apply, settle]);

  const run = useCallback(() => {
    const s = g.current;
    if (!s.moving && inner.current) inner.current.style.willChange = "transform";
    s.moving = true;
    if (!s.raf) s.raf = requestAnimationFrame(tick);
  }, [tick]);

  /** Pin the content point under `x, y` (relative to the box) for the zoom that follows. */
  const anchorAt = useCallback(
    (x: number, y: number) => {
      const s = g.current;
      if (!scroller) return;
      s.focal = { x, y };
      s.base = {
        x: baseUnder(scroller.scrollLeft, s.live, s.off, x),
        y: baseUnder(scroller.scrollTop, s.live, 0, y),
      };
    },
    [scroller]
  );

  // The box's width, followed as the window or the phone turns.
  useEffect(() => {
    if (!scroller) return;
    const ro = new ResizeObserver(() => setBox(scroller.clientWidth));
    ro.observe(scroller);
    return () => ro.disconnect();
  }, [scroller]);

  // The content's own size (unaffected by the transform), as it loads and changes.
  useEffect(() => {
    const el = inner.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      g.current.nat = { w: el.offsetWidth, h: el.offsetHeight };
      apply(false);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [apply]);

  // A committed layout zoom re-lays the content at the new width; measure
  // it before paint and redraw, so the hand-over from transform to layout
  // has no frame in between.
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    g.current.nat = { w: el.offsetWidth, h: el.offsetHeight };
    apply(g.current.moving);
  }, [committed, layoutWidth, apply]);

  // Gestures. Listeners are added by hand because touchmove and wheel must
  // be non-passive to be allowed to stop the page's own scroll and zoom.
  useEffect(() => {
    const sc = scroller;
    if (!sc) return;
    const s = g.current;
    let touching = false;
    let d0 = 1;
    let z0 = 1;
    let lastTap = { t: 0, x: 0, y: 0 };
    let tapStart: { t: number; x: number; y: number } | null = null;

    const rel = (x: number, y: number) => {
      const r = sc.getBoundingClientRect();
      return { x: x - r.left, y: y - r.top };
    };
    const two = (e: TouchEvent) => {
      const [a, b] = [e.touches[0], e.touches[1]];
      return {
        d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        mid: rel((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2),
      };
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const { d, mid } = two(e);
        touching = true;
        s.active = true;
        tapStart = null;
        d0 = d || 1;
        z0 = s.live;
        s.target = s.live;
        anchorAt(mid.x, mid.y);
        e.preventDefault();
      } else if (e.touches.length === 1) {
        const t = e.touches[0];
        tapStart = { t: e.timeStamp, x: t.clientX, y: t.clientY };
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (tapStart) {
        const t = e.touches[0];
        if (Math.hypot(t.clientX - tapStart.x, t.clientY - tapStart.y) > 10) tapStart = null;
      }
      if (!touching || e.touches.length < 2) return;
      e.preventDefault();
      const { d, mid } = two(e);
      s.target = pinchZoom(z0, d / d0);
      // Two fingers also pan: the pinned point follows their midpoint.
      s.focal = mid;
      run();
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (touching && e.touches.length < 2) {
        touching = false;
        s.active = false;
        run();
        return;
      }
      // Double-tap: in to 2× at the tap, or back out to 1×.
      if (tapStart && e.touches.length === 0 && e.timeStamp - tapStart.t < 250) {
        const now = { t: e.timeStamp, x: tapStart.x, y: tapStart.y };
        if (now.t - lastTap.t < 320 && Math.hypot(now.x - lastTap.x, now.y - lastTap.y) < 30) {
          e.preventDefault();
          const p = rel(now.x, now.y);
          anchorAt(p.x, p.y);
          s.target = s.live > 1.05 ? MIN_ZOOM : 2;
          run();
          lastTap = { t: 0, x: 0, y: 0 };
        } else lastTap = now;
      }
      tapStart = null;
    };

    // Chrome and Firefox report a trackpad pinch as ctrl + wheel.
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const p = rel(e.clientX, e.clientY);
      anchorAt(p.x, p.y);
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      s.target = wheelZoom(s.target, dy);
      run();
    };

    // Safari reports it as gesture events instead (and on iOS alongside
    // the touches, which are already handled - there they're only blocked).
    type GestureEvent = UIEvent & { scale: number; clientX: number; clientY: number };
    let gz = 1;
    const onGestureStart = (ev: Event) => {
      ev.preventDefault();
      if (touching) return;
      const e = ev as GestureEvent;
      const p = rel(e.clientX, e.clientY);
      gz = s.live;
      s.active = true;
      anchorAt(p.x, p.y);
    };
    const onGestureChange = (ev: Event) => {
      ev.preventDefault();
      if (touching) return;
      s.target = pinchZoom(gz, (ev as GestureEvent).scale);
      run();
    };
    const onGestureEnd = (ev: Event) => {
      ev.preventDefault();
      if (touching) return;
      s.active = false;
      run();
    };

    sc.addEventListener("touchstart", onTouchStart, { passive: false });
    sc.addEventListener("touchmove", onTouchMove, { passive: false });
    sc.addEventListener("touchend", onTouchEnd, { passive: false });
    sc.addEventListener("touchcancel", onTouchEnd);
    sc.addEventListener("wheel", onWheel, { passive: false });
    sc.addEventListener("gesturestart", onGestureStart);
    sc.addEventListener("gesturechange", onGestureChange);
    sc.addEventListener("gestureend", onGestureEnd);
    return () => {
      sc.removeEventListener("touchstart", onTouchStart);
      sc.removeEventListener("touchmove", onTouchMove);
      sc.removeEventListener("touchend", onTouchEnd);
      sc.removeEventListener("touchcancel", onTouchEnd);
      sc.removeEventListener("wheel", onWheel);
      sc.removeEventListener("gesturestart", onGestureStart);
      sc.removeEventListener("gesturechange", onGestureChange);
      sc.removeEventListener("gestureend", onGestureEnd);
    };
  }, [scroller, anchorAt, run]);

  useEffect(() => () => cancelAnimationFrame(g.current.raf), []);

  function zoomBy(factor: number | null) {
    const s = g.current;
    if (!scroller) return;
    anchorAt(scroller.clientWidth / 2, scroller.clientHeight / 2);
    s.target = factor === null ? MIN_ZOOM : clampZoom(s.target * factor);
    run();
  }

  return (
    <div
      ref={setScroller}
      className={`relative overflow-auto overscroll-contain ${className ?? ""}`}
      // The browser's own pinch is off here, so it's ours to handle; one
      // finger still scrolls natively, with momentum.
      style={{ touchAction: "pan-x pan-y" }}
    >
      <div ref={sizer} className="relative">
        <div
          ref={innerRef}
          className="absolute top-0"
          style={{ width: layoutWidth + 2 * pad, padding: `12px ${pad}px 96px`, transformOrigin: "0 0" }}
        >
          {contentWidth > 0 && children({ width: layoutWidth, scroller, content })}
        </div>
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-10 flex justify-center pb-safe-b">
        <div className="pointer-events-auto mb-4 flex items-center gap-1 rounded-full border bg-surface/95 px-2 py-1.5 text-sm font-bold shadow-lg backdrop-blur-sm">
          <button
            type="button"
            onClick={() => zoomBy(1 / STEP)}
            disabled={shown <= MIN_ZOOM + 0.001}
            className="flex h-8 w-8 items-center justify-center rounded-full disabled:opacity-35"
            aria-label="Zoom out"
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => zoomBy(null)}
            className="min-w-14 rounded-full px-1 text-center tabular"
            aria-label="Reset zoom"
          >
            <span ref={pct}>100%</span>
          </button>
          {label != null && <span className="border-l pl-2 pr-1 text-center text-muted tabular">{label}</span>}
          <button
            type="button"
            onClick={() => zoomBy(STEP)}
            disabled={shown >= MAX_ZOOM - 0.001}
            className="flex h-8 w-8 items-center justify-center rounded-full disabled:opacity-35"
            aria-label="Zoom in"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
