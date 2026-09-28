import { useEffect, useRef } from "react";

/** Whether this list has already played its entrance animation. */
const played = new Set<string>();

export function useHasAnimated(key: string): boolean {
  const already = useRef(played.has(key));
  useEffect(() => {
    played.add(key);
  }, [key]);
  return already.current;
}
