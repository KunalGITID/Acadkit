/**
 * Timings and geometry for the launch animation (src/components/launch-screen.tsx).
 *
 * Kept out of the component so the numbers are testable and so the one
 * value iOS also depends on has somewhere honest to live.
 */

/** The mark's width, as a percentage of the viewport's shorter side. */
export const MARK_VMIN = 24;

/** The card behind the mark, relative to the mark. */
export const CARD_RATIO = 1.75;

/** How long the mark sits perfectly still before anything moves. */
export const SEAM_HOLD_MS = 180;

/** The wordmark comes in once the card has most of the way settled. */
export const WORDMARK_DELAY_MS = 320;

/** Floor on how long the launch screen stays up, measured from mount. */
export const MIN_VISIBLE_MS = 1250;

/** The exit wipe. Long enough to read as a shutter, not a fade. */
export const EXIT_MS = 640;

/** A negative first control point makes the surface load downward before it lifts - the weight of a shutter being thrown rather than a panel being slid. */
export const EXIT_EASE = [0.62, -0.28, 0.24, 1] as const;

/** Settling, not bouncing: fast to arrive, slow to stop. */
export const SETTLE_EASE = [0.22, 1, 0.32, 1] as const;

/** Every cold start after the first of the day skips the sequence. */
export const QUICK_VISIBLE_MS = 150;
export const QUICK_EXIT_MS = 220;

/** True when this launch should play the full sequence. */
export function isFullLaunch(lastFullDay: string | null, today: string): boolean {
  return lastFullDay !== today;
}
