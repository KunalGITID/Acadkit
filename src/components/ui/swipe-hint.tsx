import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ChevronsLeftRight } from "lucide-react";

/**
 * A one-time nudge that a view can be swiped.
 *
 * Five surfaces gained swipe navigation and none of them look any
 * different, so the feature is invisible to anyone who doesn't try it.
 * Rather than decorate every tab strip permanently, this says it once
 * per surface and then never again.
 *
 * It hides the moment you actually swipe — passing `dismissed` — because
 * a hint that outlives its lesson is just clutter. Desktop never sees
 * it: there is no swipe there, and the tabs are already on screen.
 */
export function SwipeHint({
  id,
  dismissed,
  label = "swipe to switch",
}: {
  /** Storage key suffix, unique per surface. */
  id: string;
  /** True once the user has performed the gesture. */
  dismissed: boolean;
  label?: string;
}) {
  const key = `acadkit:hint:${id}`;
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(key)) setShow(true);
    } catch {
      // Storage blocked: skip the hint rather than showing it forever.
    }
  }, [key]);

  useEffect(() => {
    if (!dismissed || !show) return;
    setShow(false);
    try {
      localStorage.setItem(key, "1");
    } catch {
      /* nothing to persist to; the hint is gone for this session */
    }
  }, [dismissed, show, key]);

  if (!show) return null;

  return (
    <motion.p
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex items-center justify-center gap-1.5 pt-1 text-[11px] font-semibold text-muted lg:hidden"
    >
      <ChevronsLeftRight className="h-3.5 w-3.5" />
      {label}
    </motion.p>
  );
}
