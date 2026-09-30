/**
 * Fail the build when the app gets heavier than bundle-budget.json allows.
 * Run after `vite build`: `npm run size`.
 *
 * "Initial" is what a phone downloads before the app can start - every
 * script and stylesheet dist/index.html references. Everything else is
 * lazy (a page, the PDF viewer) and only its size cap applies. Sizes are
 * gzipped, which is roughly what goes over the wire.
 */
import { appendFileSync, readdirSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const budget = JSON.parse(readFileSync("bundle-budget.json", "utf8"));
const kb = (bytes) => bytes / 1024;
const gz = (file) => gzipSync(readFileSync(`dist/${file}`)).length;

let html;
try {
  html = readFileSync("dist/index.html", "utf8");
} catch {
  console.error("No dist/index.html - run `npx vite build` first.");
  process.exit(1);
}
const initialFiles = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]);
const assets = readdirSync("dist/assets").map((f) => `assets/${f}`);
const js = assets.filter((f) => f.endsWith(".js"));
const css = assets.filter((f) => f.endsWith(".css"));
const total = (files) => files.reduce((sum, f) => sum + gz(f), 0);
const [largestSize, largestFile] = js.map((f) => [gz(f), f]).sort((a, b) => b[0] - a[0])[0];

const rows = [
  ["Initial load", kb(total(initialFiles)), budget.initialKB, `${initialFiles.length} files`],
  ["Largest chunk", kb(largestSize), budget.largestChunkKB, largestFile.replace(/^assets\//, "")],
  ["All JavaScript", kb(total(js)), budget.totalJsKB, `${js.length} files`],
  ["All CSS", kb(total(css)), budget.cssKB, `${css.length} files`],
];

let failed = false;
const lines = rows.map(([name, size, limit, note]) => {
  const over = size > limit;
  failed ||= over;
  return `${over ? "✗" : "✓"} ${name.padEnd(15)} ${size.toFixed(1).padStart(7)} KB / ${String(limit).padStart(4)} KB  ${note}`;
});
console.log(lines.join("\n"));

if (process.env.GITHUB_STEP_SUMMARY) {
  const table = rows
    .map(([name, size, limit, note]) => `| ${size > limit ? "✗" : "✓"} ${name} | ${size.toFixed(1)} KB | ${limit} KB | ${note} |`)
    .join("\n");
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Bundle size (gzipped)\n\n| | Size | Budget | |\n|---|---|---|---|\n${table}\n`);
}

if (failed) {
  console.error("\nOver budget. Make it smaller (lazy-load it, drop a dependency), or raise the number in bundle-budget.json on purpose.");
  process.exit(1);
}
