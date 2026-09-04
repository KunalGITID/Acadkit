/**
 * Direction-aware slide variants for tabbed views.
 *
 * Lifted out of Timetable, which was the only view whose content moved
 * the way you pushed it. Marks and Insights cut between tabs instead,
 * which reads as a page replacement rather than a neighbour arriving —
 * and after a swipe, motion in the wrong direction feels like the
 * gesture missed.
 *
 * `custom` carries the direction: +1 forward, -1 back.
 */
export const slideVariants = {
  enter: (direction: number) => ({ opacity: 0, x: direction >= 0 ? 44 : -44 }),
  center: { opacity: 1, x: 0 },
  exit: (direction: number) => ({ opacity: 0, x: direction >= 0 ? -44 : 44 }),
};

export const slideTransition = {
  type: "spring" as const,
  stiffness: 320,
  damping: 32,
};
