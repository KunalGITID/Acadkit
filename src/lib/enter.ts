/**
 * The entrance every list item shares.
 *
 * Two things this fixes, both of which read as the app being slow
 * rather than as animation:
 *
 *  - **It replayed on every visit.** Pages remount on each route
 *    change, so a stagger that is charming the first time ran again
 *    every time you tapped the tab — N springs starting at once, on top
 *    of the page transition, on a screen you check ten times a day.
 *    Paired with useHasAnimated, a list animates once per session and
 *    afterwards simply appears.
 *  - **It scaled with the list.** An uncapped `index * step` means the
 *    twentieth subject waits most of a second for a gesture that
 *    already finished. The cap keeps the last item within a beat of the
 *    first however long the list gets.
 */
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
