import { useRef } from "react";

/**
 * Horizontal swipe detection for moving between sibling views.
 *
 * Pointer events rather than framer-motion drag: these targets are lists
 * and bars that must keep scrolling vertically and keep their buttons
 * tappable, and a drag container fights both.
 *
 * Three guards decide whether a gesture counts, and each exists because
 * the naive version misfires:
 *
 *  - **Direction.** A gesture is only a swipe if horizontal movement
 *    beats vertical by a clear margin, or every scroll down a slightly
 *    crooked screen flips the tab.
 *  - **Distance.** Below the threshold nothing happens, so a tap that
 *    wobbles a few pixels stays a tap.
 *  - **Mouse.** Ignored entirely. On a trackpad a horizontal wheel is a
 *    scroll, not a swipe, and desktop already has the tabs on screen.
 */
export interface SwipeHandlers {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: () => void;
}

export function useSwipe(
  onLeft: () => void,
  onRight: () => void,
  { threshold = 56 }: { threshold?: number } = {}
): SwipeHandlers {
  const start = useRef<{ x: number; y: number; id: number } | null>(null);

  return {
    onPointerDown: (e) => {
      if (e.pointerType === "mouse") return;
      start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    },
    onPointerUp: (e) => {
      const from = start.current;
      start.current = null;
      if (!from || from.id !== e.pointerId) return;

      const dx = e.clientX - from.x;
      const dy = e.clientY - from.y;
      if (Math.abs(dx) < threshold) return;
      // Comfortably horizontal, not a diagonal scroll.
      if (Math.abs(dx) < Math.abs(dy) * 1.6) return;

      if (dx < 0) onLeft();
      else onRight();
    },
    onPointerCancel: () => {
      start.current = null;
    },
  };
}
