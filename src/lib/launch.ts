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
 */
export const MARK_VMIN = 24;

/**
 * How long the mark sits perfectly still before anything moves.
 *
 * The whole illusion is that iOS's image and this component are the same
 * screen, and motion starting on frame one gives that away — the eye
 * catches the swap. A beat of stillness first sells it.
 */
export const SEAM_HOLD_MS = 140;

/**
 * Floor on how long the launch screen stays up, measured from mount.
 *
 * Not a delay for its own sake: an animation that can be cut off halfway
 * reads as jank, so it runs its course even when the session resolves
 * instantly from cache. Anything past this exits the moment the app is
 * ready.
 */
export const MIN_VISIBLE_MS = 900;

/** The exit wipe. Long enough to read as a shutter, not a fade. */
export const EXIT_MS = 520;

/**
 * Sharp in, sharp out, with a flat middle — the easing equivalent of the
 * theme's hard borders. A symmetric ease-in-out would read as soft.
 */
export const EXIT_EASE = [0.76, 0, 0.24, 1] as const;

/**
 * Whether a cold start at this path should play the launch sequence.
 *
 * /widget installs as its own home-screen app ("What's due, at a
 * glance", public/widget.webmanifest) and is opened to read one thing
 * and close again. A second and a half of branding in front of that is
 * the opposite of glanceable, so it gets none.
 */
export function shouldPlayLaunch(pathname: string): boolean {
  return !pathname.startsWith("/widget");
}
