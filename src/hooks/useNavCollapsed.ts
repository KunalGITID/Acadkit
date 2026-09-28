import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

/** Whether the bottom bar should be in its compact state. */

/** Above this the bar is always whole - a short page never collapses. */
export const NAV_TOP_ZONE = 32;
/** Ignore the jitter of a finger resting on a scrolling surface. */
export const NAV_DEAD_ZONE = 6;

/** The whole rule, as a pure function so it can be tested without a DOM. */
export function navCollapseDecision(y: number, delta: number, was: boolean): boolean {
  if (Math.abs(delta) < NAV_DEAD_ZONE) return was;
  if (y <= NAV_TOP_ZONE) return false;
  return delta > 0;
}

export function useNavCollapsed(): boolean {
  const [collapsed, setCollapsed] = useState(false);
  const lastY = useRef(0);
  const frame = useRef(0);
  const { pathname } = useLocation();

  // A new page starts at the top, so it starts whole.
  useEffect(() => {
    setCollapsed(false);
    lastY.current = window.scrollY;
  }, [pathname]);

  useEffect(() => {
    lastY.current = window.scrollY;

    function read() {
      frame.current = 0;
      const y = window.scrollY;
      const delta = y - lastY.current;
      if (Math.abs(delta) < NAV_DEAD_ZONE) return;
      lastY.current = y;
      setCollapsed((was) => navCollapseDecision(y, delta, was));
    }

    function onScroll() {
      // One read per frame: scroll fires far more often than paint, and
      // this runs on every one of them on the busiest surface in the app.
      if (frame.current) return;
      frame.current = requestAnimationFrame(read);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, []);

  return collapsed;
}
