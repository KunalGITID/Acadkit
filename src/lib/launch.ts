/**
 * Timings and geometry for the launch animation (src/components/launch-screen.tsx).
 *
 * Kept out of the component so the numbers are testable and so the one
 * value iOS also depends on has somewhere honest to live.
 */

/**
 * The mark's width, as a percentage of the viewport's shorter side.
 *
 * iOS paints a static launch image before the web view has run a line of
 * JavaScript, and the app then draws its own mark on top. Matching that
 * image's geometry is what makes the handoff invisible: same mark, same
 * size, same place, so the seam reads as one continuous screen rather
 * than a splash followed by a page. `MARK_SCALE` in scripts/lib/mark.mjs
 * is the other half of this; launch.test.ts fails if they drift.
 *
 * The generator centres the mark on the full screen, so the app has to
 * centre it on the full viewport — not inside a column that also holds
 * the wordmark, which lifts it off centre by half the wordmark's height
 * and makes it visibly jump the moment the web view paints.
 */
export const MARK_VMIN = 24;

/** The card behind the mark, relative to the mark. */
export const CARD_RATIO = 1.75;

/**
 * How long the mark sits perfectly still before anything moves.
 *
 * The whole illusion is that iOS's image and this component are the same
 * screen, and motion starting on frame one gives that away — the eye
 * catches the swap. A beat of stillness first sells it.
 */
export const SEAM_HOLD_MS = 180;

/** The wordmark comes in once the card has most of the way settled. */
export const WORDMARK_DELAY_MS = 320;

/**
 * Floor on how long the launch screen stays up, measured from mount.
 *
 * Not a delay for its own sake: an animation that can be cut off halfway
 * reads as jank, so it runs its course even when the session resolves
 * instantly from cache. Anything past this exits the moment the app is
 * ready.
 */
export const MIN_VISIBLE_MS = 1250;

/** The exit wipe. Long enough to read as a shutter, not a fade. */
export const EXIT_MS = 640;

/**
 * A negative first control point makes the surface load downward before
 * it lifts — the weight of a shutter being thrown rather than a panel
 * being slid. One tween rather than keyframes, so there is a single
 * interpolation for the compositor to run.
 */
export const EXIT_EASE = [0.62, -0.28, 0.24, 1] as const;

/** Settling, not bouncing: fast to arrive, slow to stop. */
export const SETTLE_EASE = [0.22, 1, 0.32, 1] as const;
