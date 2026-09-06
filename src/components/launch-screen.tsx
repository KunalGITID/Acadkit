import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  EXIT_EASE,
  EXIT_MS,
  MARK_VMIN,
  MIN_VISIBLE_MS,
  SEAM_HOLD_MS,
  shouldPlayLaunch,
} from "@/lib/launch";

const s = (ms: number) => ms / 1000;

/**
 * The app's opening.
 *
 * iOS has already drawn a launch image by the time this mounts — the
 * mark, centred, at MARK_VMIN of the shorter side, on the theme's
 * background. This starts as a pixel copy of that image and holds
 * still for a beat, so the handoff from the system's screen to the web
 * view has nothing to give it away. Only then does anything move.
 *
 * What moves is the theme's own vocabulary rather than a generic logo
 * flourish: the squircle that every card in the app is built from snaps
 * shut around the mark, the wordmark wipes in under it, and the whole
 * surface leaves as a shutter with the accent colour on its edge —
 * a colour block doing the transition, which is the brutalist theme's
 * entire argument about depth.
 *
 * `ready` gates the exit but does not trigger it on its own: the
 * animation always gets MIN_VISIBLE_MS to finish, because a launch
 * sequence cut off halfway looks like a bug, and a cached session
 * resolves in single-digit milliseconds.
 */
export function LaunchScreen({ ready }: { ready: boolean }) {
  // Read once, off window rather than the router: this component sits
  // above BrowserRouter so it can cover the pre-session branches, and
  // it is a cold-start decision anyway — nothing about it should change
  // when the user later navigates.
  const [play] = useState(() => shouldPlayLaunch(window.location.pathname));
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

  if (unmounted || !play) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="launch"
          // Not a dialog and not content: it is the app not being ready
          // to show yet, so it is announced as busy rather than read out.
          role="presentation"
          aria-hidden
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden bg-bg"
          initial={false}
          exit={
            reduced
              ? { opacity: 0, transition: { duration: s(EXIT_MS) / 2 } }
              : { y: "-100%", transition: { duration: s(EXIT_MS), ease: EXIT_EASE } }
          }
        >
          <div className="relative flex flex-col items-center">
            {/* The card shape, closing around the mark. Sized off the
                mark itself so the two stay proportional on any screen. */}
            <motion.div
              aria-hidden
              className="absolute rounded-[28%] border-[1.5px] border-line/30"
              style={{ width: `${MARK_VMIN * 1.75}vmin`, height: `${MARK_VMIN * 1.75}vmin` }}
              initial={{ scale: 1.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{
                delay: s(SEAM_HOLD_MS),
                type: "spring",
                stiffness: 220,
                damping: 22,
              }}
            />

            {/* Frame zero of this is what iOS is already showing. The
                mask lets the browser fill the mark with the live theme's
                ink, so one asset serves both colour schemes. */}
            <motion.div
              className="bg-ink"
              style={{
                width: `${MARK_VMIN}vmin`,
                // Square box + contain is exactly what the generator does
                // to build the iOS image (sharp's `fit: inside` into a
                // square), so the two agree on the mark's rendered width
                // without either side hardcoding the art's aspect ratio.
                aspectRatio: "1",
                maskImage: "url(/icons/mark.png)",
                WebkitMaskImage: "url(/icons/mark.png)",
                maskSize: "contain",
                WebkitMaskSize: "contain",
                maskRepeat: "no-repeat",
                WebkitMaskRepeat: "no-repeat",
                maskPosition: "center",
                WebkitMaskPosition: "center",
              }}
              initial={{ scale: 1 }}
              animate={{ scale: [1, 0.88, 1] }}
              transition={{
                delay: s(SEAM_HOLD_MS),
                duration: 0.55,
                times: [0, 0.35, 1],
                ease: [0.65, 0, 0.35, 1],
              }}
            />
          </div>

          {/* Wiped in, not faded: the theme has no soft edges. */}
          <motion.div
            className="mt-[6vmin] overflow-hidden"
            initial={{ clipPath: "inset(0 100% 0 0)" }}
            animate={{ clipPath: "inset(0 0% 0 0)" }}
            transition={{ delay: s(SEAM_HOLD_MS + 260), duration: 0.42, ease: EXIT_EASE }}
          >
            <span className="text-[4.5vmin] font-bold lowercase tracking-[0.42em] text-ink [font-family:'Chakra_Petch','Plus_Jakarta_Sans',system-ui,sans-serif]">
              {/* The tracking adds a trailing gap; the indent re-centres it. */}
              <span className="ms-[0.42em] inline-block">acadkit</span>
            </span>
          </motion.div>

          {/* The shutter's painted edge. It sits below the fold of the
              surface, so it only becomes visible as the surface leaves —
              sweeping up the screen ahead of the app. */}
          {!reduced && (
            <div className="absolute inset-x-0 top-full h-[1.5vmin] bg-accent" aria-hidden />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
