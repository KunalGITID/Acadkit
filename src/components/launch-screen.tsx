import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  CARD_RATIO,
  EXIT_EASE,
  EXIT_MS,
  MARK_VMIN,
  MIN_VISIBLE_MS,
  QUICK_EXIT_MS,
  QUICK_VISIBLE_MS,
  isFullLaunch,
  SEAM_HOLD_MS,
  SETTLE_EASE,
  WORDMARK_DELAY_MS,
} from "@/lib/launch";

const s = (ms: number) => ms / 1000;

const LAUNCH_DAY_KEY = "acadkit:launch-day";

/** Decided once per page load; storage failures fall back to the full sequence. */
function decideFullLaunch(): boolean {
  try {
    const today = new Date().toLocaleDateString("en-CA");
    const full = isFullLaunch(localStorage.getItem(LAUNCH_DAY_KEY), today);
    if (full) localStorage.setItem(LAUNCH_DAY_KEY, today);
    return full;
  } catch {
    return true;
  }
}

/** The mark, drawn as a CSS mask so the browser fills it with the live theme's --ink - one asset for every theme and mode, and it can never disagree with the palette the way a baked-in colour would. */
function Mark() {
  return (
    <div
      className="h-full w-full bg-ink"
      style={{
        maskImage: "url(/icons/mark.png)",
        WebkitMaskImage: "url(/icons/mark.png)",
        maskSize: "contain",
        WebkitMaskSize: "contain",
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskPosition: "center",
      }}
    />
  );
}

/** The app's opening. */
export function LaunchScreen({ ready }: { ready: boolean }) {
  const [visible, setVisible] = useState(true);
  const [unmounted, setUnmounted] = useState(false);
  const mountedAt = useRef(0);
  const reduced = useReducedMotion();
  const [full] = useState(decideFullLaunch);
  const minVisible = full ? MIN_VISIBLE_MS : QUICK_VISIBLE_MS;
  const exitMs = full ? EXIT_MS : QUICK_EXIT_MS;

  if (mountedAt.current === 0) mountedAt.current = performance.now();

  useEffect(() => {
    if (!ready) return;
    const remaining = minVisible - (performance.now() - mountedAt.current);
    const timer = setTimeout(() => setVisible(false), Math.max(0, remaining));
    return () => clearTimeout(timer);
  }, [ready, minVisible]);

  /** The failsafe, and not a theoretical one. */
  useEffect(() => {
    if (visible) return;
    const timer = setTimeout(() => setUnmounted(true), exitMs + 250);
    return () => clearTimeout(timer);
  }, [visible, exitMs]);

  if (unmounted) return null;

  const cardSize = `${MARK_VMIN * CARD_RATIO}vmin`;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="launch"
          // Not a dialog and not content: it is the app not being ready
          // to show yet, so it is announced as busy rather than read out.
          role="presentation"
          aria-hidden
          // items-center, and the wordmark is positioned off the mark rather than stacked with it in a column - a column would centre the *pair*, lifting the mark off the middle of the screen and away from where iOS just drew it.
          className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-bg"
          style={{ willChange: "transform" }}
          initial={false}
          exit={
            !full
              ? { opacity: 0, transition: { duration: s(QUICK_EXIT_MS) } }
              : reduced
              ? { opacity: 0, transition: { duration: s(EXIT_MS) / 2 } }
              : { y: "-100%", transition: { duration: s(EXIT_MS), ease: EXIT_EASE } }
          }
        >
          <div
            className="relative flex items-center justify-center"
            style={{ width: cardSize, height: cardSize }}
          >
            {/* The app's own card, closing around the mark. */}
            {full && (
            <motion.div
              className="absolute inset-0"
              style={{ willChange: "transform, opacity" }}
              initial={{ scale: 1.16, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{
                delay: s(SEAM_HOLD_MS),
                duration: 0.72,
                ease: SETTLE_EASE,
              }}
            >
              <div className="card h-full w-full" />
            </motion.div>
            )}

            {/* Square box + contain is exactly what the generator does to build the iOS image (sharp's `fit: inside` into a square), so the two agree on the mark's rendered width without either side hardcoding the art's aspect ratio. */}
            <motion.div
              className="relative"
              style={{ width: `${MARK_VMIN}vmin`, aspectRatio: "1", willChange: "transform" }}
              initial={{ scale: 1 }}
              animate={full ? { scale: [1, 0.9, 1.02, 1] } : { scale: 1 }}
              transition={{
                delay: s(SEAM_HOLD_MS),
                duration: 0.86,
                times: [0, 0.36, 0.7, 1],
                ease: SETTLE_EASE,
              }}
            >
              <Mark />
            </motion.div>

            {/* Rises into place behind its own edge. Transform only -
                clip-path animates on the CPU in WebKit. */}
            {full && (
            <div className="absolute left-1/2 top-full w-max -translate-x-1/2 overflow-hidden pt-[1vmin]">
              <motion.span
                className="block text-[4.5vmin] font-bold lowercase tracking-[0.42em] text-ink [font-family:'Chakra_Petch','Plus_Jakarta_Sans',system-ui,sans-serif]"
                style={{ willChange: "transform" }}
                initial={{ y: "115%" }}
                animate={{ y: "0%" }}
                transition={{
                  delay: s(SEAM_HOLD_MS + WORDMARK_DELAY_MS),
                  duration: 0.62,
                  ease: SETTLE_EASE,
                }}
              >
                {/* The tracking adds a trailing gap; the indent re-centres it. */}
                <span className="ms-[0.42em] inline-block">acadkit</span>
              </motion.span>
            </div>
            )}
          </div>

          {/* The shutter's painted edge. It sits below the fold of the
              surface, so it only becomes visible as the surface leaves -
              sweeping up the screen ahead of the app. */}
          {full && !reduced && (
            <div className="absolute inset-x-0 top-full h-[2vmin] bg-accent" aria-hidden />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
