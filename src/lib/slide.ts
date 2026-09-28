/** Direction-aware slide variants for tabbed views. */
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
