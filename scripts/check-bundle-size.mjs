/**
 * Fail the build when the app gets heavier than bundle-budget.json allows.
 * Run after `vite build`: `npm run size`.
 *
 * "Visitor load" is what dist/index.html pulls in: all a signed-out
 * visitor downloads before the landing page shows. "Signed-in start" adds
 * the app chunk and everything it imports. Everything else is lazy (a
 * page, the PDF viewer) and only the per-chunk cap applies. Sizes are
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

/**
 * A signed-in start: the visitor's files plus the app chunk (src/main.tsx
 * imports src/App.tsx lazily) and every chunk it statically imports.
 */
function withStaticImports(start) {
  const seen = new Set();
  const visit = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const code = readFileSync(`dist/${file}`, "utf8");
    for (const m of code.matchAll(/(?:from|import)\s*"\.\/([^"]+\.js)"/g)) visit(`assets/${m[1]}`);
  };
  start.forEach(visit);
  return [...seen];
}
const appChunk = js.find((f) => /^assets\/App-[\w-]+\.js$/.test(f));
if (!appChunk) {
  console.error("Couldn't find the App chunk (assets/App-*.js) - has src/main.tsx stopped importing it lazily?");
  process.exit(1);
}
const appStart = [...new Set([...initialFiles, ...withStaticImports([appChunk])])];

const rows = [
  ["Visitor load", kb(total(initialFiles)), budget.initialKB, `${initialFiles.length} files, the landing page`],
  ["Signed-in start", kb(total(appStart)), budget.appStartKB, `${appStart.length} files`],
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
