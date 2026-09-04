import { useEffect, useRef } from "react";

/**
 * Whether this list has already played its entrance animation.
 *
 * A stagger is charming the first time and slow the fifth. Tracked per
 * key for the life of the tab, so a list animates once and then just
 * appears — revisiting a page you check ten times a day should feel
 * instant, not choreographed.
 */
const played = new Set<string>();

export function useHasAnimated(key: string): boolean {
  const already = useRef(played.has(key));
  useEffect(() => {
    played.add(key);
  }, [key]);
  return already.current;
}
