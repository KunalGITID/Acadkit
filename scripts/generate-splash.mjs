/**
 * iOS PWA launch screens.
 *
 *   node scripts/generate-splash.mjs
 *
 * Without `apple-touch-startup-image`, an installed iOS PWA shows a blank
 * white screen between tap and first paint — the single most obvious tell
 * that an app is "just a website". iOS only accepts exact device pixel
 * dimensions, matched by media query, so every supported screen needs its
 * own file.
 *
 * Light and dark variants are generated because iOS honours
 * prefers-color-scheme in the startup-image media query, and a dark flash
 * on a light theme is the same bug in reverse.
 *
 * These are written to public/splash/ and deliberately kept OUT of the
 * service worker precache (see globIgnores in vite.config.ts) — Safari
 * loads them directly at launch, so precaching ~20 images would bloat
 * every install for nothing.
 */
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import { MARK_SCALE, tintedMark } from "./lib/mark.mjs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const source = join(root, "public", "icons", "source-logo.png");
const outDir = join(root, "public", "splash");

/**
 * Portrait CSS dimensions and DPR for every iPhone still worth
 * supporting. The manifest locks orientation to portrait, so landscape
 * variants would never be shown.
 *
 * A device missing from this list gets no match, and iOS falls back to
 * generating its own launch screen from the manifest — the app icon
 * blown up on `background_color`. That fallback is the reason a new
 * phone can suddenly look unbranded at launch, so add sizes here as
 * they ship.
 */
const DEVICES = [
  { w: 440, h: 956, dpr: 3 }, // 17 Pro Max, 16 Pro Max
  { w: 420, h: 912, dpr: 3 }, // Air
  { w: 402, h: 874, dpr: 3 }, // 17, 17 Pro, 16 Pro
  { w: 430, h: 932, dpr: 3 }, // 16 Plus, 15/14 Pro Max
  { w: 393, h: 852, dpr: 3 }, // 16, 15/14 Pro
  { w: 428, h: 926, dpr: 3 }, // 13/12 Pro Max
  { w: 390, h: 844, dpr: 3 }, // 13/12
  { w: 375, h: 812, dpr: 3 }, // X/XS/11 Pro/13 mini
  { w: 414, h: 896, dpr: 3 }, // XS Max/11 Pro Max
  { w: 414, h: 896, dpr: 2 }, // XR/11
  { w: 375, h: 667, dpr: 2 }, // SE 2/3, 8
  { w: 320, h: 568, dpr: 2 }, // SE 1
];

/**
 * The launch screen's whole job is to be indistinguishable from the
 * app's first paint, so these must be the *default* theme's --bg and
 * --ink: brutalist in src/index.css, whose hexes are also mirrored in
 * the BG_HEX map in index.html. Keep all three in sync.
 */
const THEMES = {
  light: {
    bg: { r: 247, g: 247, b: 247 }, // --bg  0 0% 97%
    ink: { r: 15, g: 15, b: 15 }, //  --ink 0 0% 6%
    suffix: "",
  },
  dark: {
    bg: { r: 10, g: 10, b: 10 }, //    --bg  0 0% 4%
    ink: { r: 250, g: 250, b: 250 }, //--ink 0 0% 98%
    suffix: "-dark",
  },
};

mkdirSync(outDir, { recursive: true });

const links = [];

for (const [scheme, theme] of Object.entries(THEMES)) {
  for (const { w, h, dpr } of DEVICES) {
    const pxW = w * dpr;
    const pxH = h * dpr;
    const logoPx = Math.round(Math.min(pxW, pxH) * MARK_SCALE);
    const mark = await tintedMark(source, logoPx, theme.ink);

    const name = `splash-${w}x${h}@${dpr}x${theme.suffix}.png`;
    await sharp({
      create: { width: pxW, height: pxH, channels: 4, background: { ...theme.bg, alpha: 1 } },
    })
      .composite([{ input: mark, gravity: "center" }])
      // A flat background plus one logo is a handful of colours; a
      // palette PNG stores that in a fraction of the space, and these
      // ship with every install.
      .png({ palette: true, quality: 90, effort: 9 })
      .toFile(join(outDir, name));

    links.push(
      `<link rel="apple-touch-startup-image" ` +
        `media="(prefers-color-scheme: ${scheme}) and (device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait)" ` +
        `href="/splash/${name}" />`
    );
  }
}

// Emitted for index.html; the tags are pasted between the markers there.
writeFileSync(join(outDir, "links.html"), links.join("\n") + "\n");

console.log(
  `Wrote ${links.length} launch screens to public/splash/ ` +
    `(${DEVICES.length} devices x ${Object.keys(THEMES).length} colour schemes)`
);
console.log("Tags written to public/splash/links.html");
