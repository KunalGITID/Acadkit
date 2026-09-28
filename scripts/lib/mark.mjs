/** The AcadKit mark, extracted from the source artwork. */
import sharp from "sharp";

/** The fraction of the screen's shorter side the mark occupies. */
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
