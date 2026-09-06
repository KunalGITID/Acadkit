import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  CARD_RATIO,
  EXIT_EASE,
  EXIT_MS,
  MARK_VMIN,
  MIN_VISIBLE_MS,
  SEAM_HOLD_MS,
  SETTLE_EASE,
  WORDMARK_DELAY_MS,
} from "@/lib/launch";

const s = (ms: number) => ms / 1000;

/**
 * The mark, drawn as a CSS mask so the browser fills it with the live
 * theme's --ink — one asset for every theme and mode, and it can never
 * disagree with the palette the way a baked-in colour would.
 *
 * Deliberately not the element that gets animated. Transforming a masked
 * element makes WebKit re-apply the mask on the CPU every frame, which
 * is what a 24vmin logo stuttering on a 120Hz screen looks like. Static
 * here, moved by the wrapper above it, it rasterises once and the
 * compositor does the rest.
 */
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

/**
 * The app's opening.
 *
 * iOS has already drawn a launch image by the time this mounts — the
 * mark, centred on the screen, at MARK_VMIN of the shorter side, on the
 * theme's background. This starts as a pixel copy of that image and
 * holds still for a beat, so the handoff from the system's screen to the
 * web view has nothing to give it away. Only then does anything move.
 *
 * What moves is the theme's own vocabulary rather than a generic logo
 * flourish: an actual `.card` — so it arrives with each theme's radius,
 * border weight, surface and shadow — settles around the mark, the
 * wordmark rises under it, and the whole surface leaves as a shutter
 * with the accent colour on its edge. A colour block doing the
 * transition is the brutalist theme's entire argument about depth, and
 * in OLED the same block is a neutral grey, because zero saturation is
 * that theme's whole argument.
 *
 * `ready` gates the exit but does not trigger it on its own: the
 * animation always gets MIN_VISIBLE_MS to finish, because a launch
 * sequence cut off halfway looks like a bug, and a cached session
 * resolves in single-digit milliseconds.
 */
export function LaunchScreen({ ready }: { ready: boolean }) {
  const [visible, setVisible] = useState(true);
  const [unmounted, setUnmounted] = useState(false);
  const mountedAt = useRef(0);
  const reduced = useReducedMotion();

  if (mountedAt.current === 0) mountedAt.current = performance.now();

  useEffect(() => {
    if (!ready) return;
    const remaining = MIN_VISIBLE_MS - (performance.now() - mountedAt.current);
    const timer = setTimeout(() => setVisible(false), Math.max(0, remaining));
    return () => clearTimeout(timer);
  }, [ready]);

  /**
   * The failsafe, and not a theoretical one.
   *
   * AnimatePresence only unmounts a child once its exit animation
   * *completes*, and animation clocks stop when the page isn't being
   * painted — background the app mid-launch and requestAnimationFrame
   * can suspend outright. The exit then never finishes, and because this
   * is a fixed, full-screen layer, the app underneath is not just hidden
   * but untappable. Timers keep running when rAF doesn't, so one drops
   * the layer regardless of what the animation did or didn't do.
   */
  useEffect(() => {
    if (visible) return;
    const timer = setTimeout(() => setUnmounted(true), EXIT_MS + 250);
    return () => clearTimeout(timer);
  }, [visible]);

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
          // items-center, and the wordmark is positioned off the mark
          // rather than stacked with it in a column — a column would
          // centre the *pair*, lifting the mark off the middle of the
          // screen and away from where iOS just drew it.
          className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-bg"
          style={{ willChange: "transform" }}
          initial={false}
          exit={
            reduced
              ? { opacity: 0, transition: { duration: s(EXIT_MS) / 2 } }
              : { y: "-100%", transition: { duration: s(EXIT_MS), ease: EXIT_EASE } }
          }
        >
          <div
            className="relative flex items-center justify-center"
            style={{ width: cardSize, height: cardSize }}
          >
            {/* The app's own card, closing around the mark. */}
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

            {/* Square box + contain is exactly what the generator does to
                build the iOS image (sharp's `fit: inside` into a square),
                so the two agree on the mark's rendered width without
                either side hardcoding the art's aspect ratio. */}
            <motion.div
              className="relative"
              style={{ width: `${MARK_VMIN}vmin`, aspectRatio: "1", willChange: "transform" }}
              initial={{ scale: 1 }}
              animate={{ scale: [1, 0.9, 1.02, 1] }}
              transition={{
                delay: s(SEAM_HOLD_MS),
                duration: 0.86,
                times: [0, 0.36, 0.7, 1],
                ease: SETTLE_EASE,
              }}
            >
              <Mark />
            </motion.div>

            {/* Rises into place behind its own edge. Transform only —
                clip-path animates on the CPU in WebKit. */}
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
          </div>

          {/* The shutter's painted edge. It sits below the fold of the
              surface, so it only becomes visible as the surface leaves —
              sweeping up the screen ahead of the app. */}
          {!reduced && (
            <div className="absolute inset-x-0 top-full h-[2vmin] bg-accent" aria-hidden />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
