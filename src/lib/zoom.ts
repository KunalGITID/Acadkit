/** The file viewer's zoom, as numbers. */

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;
/** How much of a pinch reaches the zoom: 1 is direct, lower is heavier. */
export const RESISTANCE = 0.8;
/** How far past a limit a pinch still gets, as a power of the overshoot. */
export const OVERSHOOT = 0.35;
/** The share of the remaining distance covered each frame. */
export const EASE = 0.28;
/** The step of the − / + buttons. */
export const STEP = 1.5;

export function clampZoom(z: number, min = MIN_ZOOM, max = MAX_ZOOM): number {
  return Math.min(max, Math.max(min, z));
}

/** Beyond a limit, give way ever less: max · (z/max)^OVERSHOOT. */
export function rubberBand(z: number, min = MIN_ZOOM, max = MAX_ZOOM): number {
  if (z > max) return max * Math.pow(z / max, OVERSHOOT);
  if (z < min) return min * Math.pow(z / min, OVERSHOOT);
  return z;
}

/**
 * The zoom a pinch asks for: where it started, times how far the fingers
 * have spread (`ratio`, now ÷ then), damped and rubber-banded.
 */
export function pinchZoom(start: number, ratio: number, min = MIN_ZOOM, max = MAX_ZOOM): number {
  if (!(ratio > 0)) return start;
  return rubberBand(start * Math.pow(ratio, RESISTANCE), min, max);
}

/**
 * A trackpad pinch (ctrl + wheel in Chrome and Firefox) or a mouse wheel
 * with ctrl held: each event is a small multiplicative nudge.
 */
export function wheelZoom(current: number, deltaY: number, min = MIN_ZOOM, max = MAX_ZOOM): number {
  return clampZoom(current * Math.exp(-deltaY * 0.01 * RESISTANCE), min, max);
}

/** One frame of easing toward `target`. Snaps once it's close enough to not matter. */
export function easeToward(live: number, target: number): number {
  const next = live + (target - live) * EASE;
  return Math.abs(target - next) < 0.001 ? target : next;
}

/** Where to scroll so the content point `base` (in unzoomed content units) sits under the screen point `focal` (relative to the scroll box) at scale `zoom`, with the content drawn `offset` in from the box's edge. */
export function scrollFor(base: number, zoom: number, offset: number, focal: number): number {
  return base * zoom + offset - focal;
}

/** The content point under `focal`: `scrollFor` run backwards. */
export function baseUnder(scroll: number, zoom: number, offset: number, focal: number): number {
  return (scroll + focal - offset) / zoom;
}

/** How far to inset content narrower than the box, to centre it. */
export function centreOffset(box: number, content: number): number {
  return Math.max(0, (box - content) / 2);
}
