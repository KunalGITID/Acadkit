import { useRef, useState } from "react";
import { motion, useAnimationControls } from "framer-motion";
import { X } from "lucide-react";
import { cn, haptic } from "@/lib/utils";

/**
 * Swipe a class row left to mark it absent.
 *
 * Only absent, and only one direction. Auto-marking already assumes you
 * turned up, so the gesture is reserved for the exception — a two-way
 * swipe would give the common case a control it doesn't need and make
 * the rare one easy to trigger by accident.
 *
 * The row follows your finger and springs back if you don't commit,
 * which is what tells you the gesture exists at all. Vertical intent
 * wins: the page has to stay scrollable, so a gesture that starts
 * downwards is released immediately rather than fought for.
 */
export function SwipeToAbsent({
  onAbsent,
  disabled,
  children,
  className,
}: {
  onAbsent: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const controls = useAnimationControls();
  const start = useRef<{ x: number; y: number } | null>(null);
  const axis = useRef<"undecided" | "x" | "y">("undecided");
  const [armed, setArmed] = useState(false);

  const COMMIT = 96;

  function reset() {
    start.current = null;
    axis.current = "undecided";
    setArmed(false);
    void controls.start({ x: 0, transition: { type: "spring", stiffness: 500, damping: 40 } });
  }

  if (disabled) return <div className={className}>{children}</div>;

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {/* Revealed behind the row as it slides. */}
      <div
        className={cn(
          "absolute inset-y-0 right-0 flex w-28 items-center justify-end gap-2 rounded-2xl bg-bad-deep pr-4 text-white transition-opacity",
          armed ? "opacity-100" : "opacity-60"
        )}
      >
        <X className="h-4 w-4" />
        <span className="text-xs font-bold">absent</span>
      </div>

      <motion.div
        animate={controls}
        className={cn("relative touch-pan-y", className)}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse") return;
          start.current = { x: e.clientX, y: e.clientY };
          axis.current = "undecided";
        }}
        onPointerMove={(e) => {
          const from = start.current;
          if (!from) return;
          const dx = e.clientX - from.x;
          const dy = e.clientY - from.y;

          if (axis.current === "undecided") {
            if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
            // Let the page scroll if the gesture was ever vertical.
            axis.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
            if (axis.current === "y") start.current = null;
            return;
          }

          // Left only; resist any rightward pull so the direction reads.
          const x = Math.min(0, dx);
          void controls.set({ x });
          const next = x <= -COMMIT;
          if (next !== armed) {
            if (next) haptic();
            setArmed(next);
          }
        }}
        onPointerUp={(e) => {
          const from = start.current;
          if (!from || axis.current !== "x") return reset();
          if (e.clientX - from.x <= -COMMIT) {
            haptic([10, 40, 14]);
            onAbsent();
          }
          reset();
        }}
        onPointerCancel={reset}
      >
        {children}
      </motion.div>
    </div>
  );
}
