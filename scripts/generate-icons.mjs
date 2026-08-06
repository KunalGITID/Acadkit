import sharp from "sharp";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const source = join(root, "public", "icons", "source-logo.png");

// iOS/macOS 26 (Liquid Glass) auto-masks whatever square you hand it — it
// applies its own corner radius and specular/glass treatment on top, so the
// source must be a flat, full-bleed, opaque square with NO pre-baked corner
// rounding of its own (a manually-rounded source fights the system mask and
// produces a visible double-edge). Android's "maskable" purpose additionally
// requires content to stay inside a safe zone since the OS may crop to a
// circle or other shape, so the artwork is centered with a margin rather
// than touching the edges.
const MASTER_SIZE = 1024;
const CONTENT_SCALE = 0.82; // fraction of the canvas the artwork occupies
const BACKGROUND = { r: 255, g: 255, b: 255, alpha: 1 }; // matches the artwork's white card

async function buildMasterBuffer() {
  const content = Math.round(MASTER_SIZE * CONTENT_SCALE);
  const artwork = await sharp(source)
    .resize(content, content, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  return sharp({
    create: {
      width: MASTER_SIZE,
      height: MASTER_SIZE,
      channels: 4,
      background: BACKGROUND,
    },
  })
    .composite([{ input: artwork, gravity: "center" }])
    .png()
    .toBuffer();
}

async function generate(masterBuffer, size, outName) {
  await sharp(masterBuffer)
    .resize(size, size)
    .png()
    .toFile(join(root, "public", "icons", outName));
  console.log(`✓ ${outName} (${size}x${size})`);
}

const masterBuffer = await buildMasterBuffer();
await generate(masterBuffer, 192, "icon-192.png");
await generate(masterBuffer, 512, "icon-512.png");
await generate(masterBuffer, 180, "apple-touch-icon.png");
console.log("Icons generated successfully.");
