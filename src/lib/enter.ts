/** The entrance every list item shares. */
export const STAGGER_STEP = 0.04;
export const STAGGER_CAP = 8;

export interface ListEntry {
  initial: false | { opacity: number; y: number };
  animate?: { opacity: number; y: number };
  transition?: {
    type: "spring";
    stiffness: number;
    damping: number;
    delay: number;
  };
}

/** Motion props for item `index`; inert once the list has played. */
export function listEntry(index: number, settled: boolean): ListEntry {
  if (settled) return { initial: false };
  return {
    initial: { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    transition: {
      type: "spring",
      stiffness: 260,
      damping: 26,
      delay: Math.min(index, STAGGER_CAP) * STAGGER_STEP,
    },
  };
}
