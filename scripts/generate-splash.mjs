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
 */
const DEVICES = [
  { w: 440, h: 956, dpr: 3 }, // 16 Pro Max
  { w: 402, h: 874, dpr: 3 }, // 16 Pro
  { w: 430, h: 932, dpr: 3 }, // 15/14 Pro Max
  { w: 393, h: 852, dpr: 3 }, // 15/14 Pro
  { w: 428, h: 926, dpr: 3 }, // 13/12 Pro Max
  { w: 390, h: 844, dpr: 3 }, // 13/12
  { w: 375, h: 812, dpr: 3 }, // X/XS/11 Pro/13 mini
  { w: 414, h: 896, dpr: 3 }, // XS Max/11 Pro Max
  { w: 414, h: 896, dpr: 2 }, // XR/11
  { w: 375, h: 667, dpr: 2 }, // SE 2/3, 8
  { w: 320, h: 568, dpr: 2 }, // SE 1
];

// Matches background_color in the manifest and --bg in src/index.css.
const THEMES = {
  light: { bg: { r: 249, g: 244, b: 240, alpha: 1 }, suffix: "" },
  dark: { bg: { r: 10, g: 11, b: 16, alpha: 1 }, suffix: "-dark" },
};

/** The logo occupies this fraction of the screen's shorter side. */
const LOGO_SCALE = 0.32;

mkdirSync(outDir, { recursive: true });

const links = [];

for (const [scheme, theme] of Object.entries(THEMES)) {
  for (const { w, h, dpr } of DEVICES) {
    const pxW = w * dpr;
    const pxH = h * dpr;
    const logoPx = Math.round(Math.min(pxW, pxH) * LOGO_SCALE);

    const logo = await sharp(source)
      .resize(logoPx, logoPx, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .toBuffer();

    const name = `splash-${w}x${h}@${dpr}x${theme.suffix}.png`;
    await sharp({
      create: { width: pxW, height: pxH, channels: 4, background: theme.bg },
    })
      .composite([{ input: logo, gravity: "center" }])
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
