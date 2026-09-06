/**
 * The AcadKit mark, extracted from the source artwork.
 *
 * `source-logo.png` is opaque black-on-white, so compositing it onto
 * anything but white lands a card in the middle of the screen. Inverted
 * luminance turns the art itself into an alpha channel, which can then be
 * filled with whatever ink the surface needs — or handed to CSS as a mask
 * so the browser picks the ink per theme.
 *
 * Shared by generate-icons.mjs, generate-splash.mjs and the in-app launch
 * screen's asset so the mark can't drift between the launch image iOS
 * shows and the one React draws on top of it.
 */
import sharp from "sharp";

/**
 * The fraction of the screen's shorter side the mark occupies.
 *
 * This is the seam between the two launch screens: iOS shows a static
 * PNG with the mark at this scale, then React draws its own on top. If
 * the two disagree the mark visibly jumps at the handoff, so the app
 * side mirrors this as `MARK_VMIN` in src/lib/launch.ts and
 * launch.test.ts fails the build if they drift.
 *
 * Also deliberately restrained: the only source art is a 156px raster,
 * and past roughly a quarter of the width the upscale starts to show.
 */
export const MARK_SCALE = 0.24;

/**
 * One channel: opaque where the artwork is, transparent where the page
 * was. `fit: inside` keeps the source's aspect ratio, so callers get back
 * the real dimensions rather than a padded square.
 */
export async function markAlpha(source, sizePx) {
  return sharp(source)
    .greyscale()
    .negate()
    // The art is strongly bimodal but carries a little haze between the
    // two peaks; this clamps near-white to fully transparent without
    // biting into the anti-aliased edges.
    .linear(1.2, -12)
    .resize(sizePx, sizePx, { fit: "inside", kernel: "lanczos3" })
    .toBuffer();
}

/** The mark as a PNG buffer, filled with `ink` ({ r, g, b }). */
export async function tintedMark(source, sizePx, ink) {
  const alpha = await markAlpha(source, sizePx);
  const { width, height } = await sharp(alpha).metadata();

  return sharp({ create: { width, height, channels: 3, background: ink } })
    .joinChannel(alpha)
    .png()
    .toBuffer();
}
