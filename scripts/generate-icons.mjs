import sharp from "sharp";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const input = join(root, "public", "icons", "new_logo.png");
const bg = { r: 10, g: 10, b: 15, alpha: 1 };

async function generate(size, outName) {
  await sharp(input)
    .resize(size, size, { fit: "contain", background: bg })
    .png()
    .toFile(join(root, "public", "icons", outName));
  console.log(`✓ ${outName} (${size}x${size})`);
}

await generate(192, "icon-192.png");
await generate(512, "icon-512.png");
await generate(180, "apple-touch-icon.png");
console.log("Icons generated successfully.");
