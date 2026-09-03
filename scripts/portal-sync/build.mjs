/**
 * Builds the portal-sync bookmarklet.
 *
 *   node scripts/portal-sync/build.mjs --pin 1234
 *
 * Reads Supabase credentials from .env.local (or the environment), inlines
 * them along with your PIN, minifies, and writes an install page you drag
 * to the bookmarks bar. The output embeds your anon key and PIN, so it is
 * gitignored — treat it like the AcadKit URL itself.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

/** Parse .env.local without pulling in a dotenv dependency. */
function env() {
  const out = { ...process.env };
  const file = resolve(root, ".env.local");
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const e = env();
const diagOnly = process.argv.includes("--diagnostics");
const url = diagOnly ? "" : e.VITE_SUPABASE_URL;
const key = diagOnly ? "" : e.VITE_SUPABASE_ANON_KEY;
const pin = diagOnly ? "" : arg("pin");

// A diagnostics build reports what it sees and writes nothing, so it needs
// no credentials — it is the safe first step on a portal whose markup the
// parser hasn't been taught yet.
if (!diagOnly) {
  const missing = [
    !url && "VITE_SUPABASE_URL (.env.local)",
    !key && "VITE_SUPABASE_ANON_KEY (.env.local)",
    !pin && "--pin <your 4-digit AcadKit PIN>",
  ].filter(Boolean);

  if (missing.length) {
    console.error(
      "Missing:\n  " + missing.join("\n  ") +
      "\n\nOr build a credential-free capture bookmarklet:\n" +
      "  node scripts/portal-sync/build.mjs --diagnostics"
    );
    process.exit(1);
  }
  if (!/^\d{4}$/.test(pin)) {
    console.error(`--pin must be 4 digits, got "${pin}"`);
    process.exit(1);
  }
}

const source = readFileSync(resolve(here, "portal-sync.js"), "utf8")
  .replace("__SUPABASE_URL__", url)
  .replace("__SUPABASE_ANON_KEY__", key)
  .replace("__PIN__", pin)
  .replace("__DIAG_ONLY__", String(diagOnly));

const { outputFiles } = await build({
  stdin: { contents: source, loader: "js" },
  minify: true,
  bundle: false,
  write: false,
  target: ["safari14", "chrome90"],
});

const href = "javascript:" + encodeURIComponent(outputFiles[0].text.trim());
const dist = resolve(here, "dist");
mkdirSync(dist, { recursive: true });

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

const STYLE = `
body{font:15px/1.6 ui-sans-serif,system-ui,-apple-system,sans-serif;max-width:640px;margin:48px auto;padding:0 20px;color:#14161a;background:#fbfbfd}
h1{font-size:21px;margin:0 0 4px}p{color:#4b515c}code{font:13px ui-monospace,Menlo,monospace;background:#eef0f4;padding:2px 5px;border-radius:4px}
a.bm{display:inline-block;background:#7c6af7;color:#fff;text-decoration:none;font-weight:600;padding:11px 20px;border-radius:10px;margin:14px 0}
ol{padding-left:20px}li{margin:7px 0}textarea{width:100%;height:110px;font:11px ui-monospace,Menlo,monospace;border:1px solid #dcdfe6;border-radius:8px;padding:10px;background:#fff}
.warn{background:#fff6e5;border:1px solid #f5dfae;border-radius:9px;padding:11px 14px;font-size:13.5px;margin:20px 0}
`;

const page = diagOnly
  ? `<!doctype html><meta charset=utf-8><title>AcadKit portal diagnostics</title>
<meta name=viewport content="width=device-width,initial-scale=1">
<style>${STYLE}</style>
<h1>AcadKit portal diagnostics</h1>
<p>Captures the table structure of a portal page so the parser can be taught to read it.
<b>No credentials are baked into this build</b> and it writes nothing anywhere &mdash; it only
describes the page you run it on.</p>
<a class="bm" href="${esc(href)}">AcadKit Diagnostics</a>
<p style="font-size:13.5px">Drag that button to your bookmarks bar.</p>
<h3>Using it</h3>
<ol>
<li>Log in to the student portal as usual.</li>
<li>Navigate to the <b>attendance</b> report and wait for the numbers to appear.</li>
<li>Click the <b>AcadKit Diagnostics</b> bookmark.</li>
<li>Read the dump over for anything you would rather not share, then copy it.</li>
<li>Repeat on the <b>marks</b> report &mdash; it is a separate capture.</li>
</ol>
<div class="warn">The portal routes on the URL hash, so the report has to be on screen
<em>before</em> you click &mdash; the dump describes whatever is rendered at that moment.</div>
`
  : `<!doctype html><meta charset=utf-8><title>AcadKit portal sync</title>
<meta name=viewport content="width=device-width,initial-scale=1">
<style>${STYLE}</style>
<h1>AcadKit portal sync</h1>
<p>Syncs marks and attendance from the SRM portal into AcadKit &mdash; PIN <code>${esc(pin)}</code>.</p>
<a class="bm" href="${esc(href)}">AcadKit Sync</a>
<p style="font-size:13.5px">Drag that button to your bookmarks bar. Clicking it here does nothing useful &mdash; it only works on a portal page.</p>
<h3>Using it</h3>
<ol>
<li>Open the SRM portal and log in as usual.</li>
<li>Go to the attendance / marks report page.</li>
<li>Click the <b>AcadKit Sync</b> bookmark.</li>
<li>Check the preview panel, then hit <b>Sync to AcadKit</b>.</li>
</ol>
<h3>On iPhone</h3>
<ol>
<li>Bookmark any page in Safari.</li>
<li>Edit the bookmark, rename it <b>AcadKit Sync</b>, and replace its address with the text below.</li>
<li>Open the portal, then pick that bookmark from the address bar.</li>
</ol>
<textarea readonly onclick="this.select()">${esc(href)}</textarea>
<div class="warn">This file has your Supabase anon key and PIN baked in &mdash; anyone with it can read and write your AcadKit data. Keep it off shared machines; it is gitignored for that reason.</div>
`;

const name = diagOnly ? "diagnostics.html" : "install.html";
writeFileSync(resolve(dist, name), page);

console.log(
  `Wrote scripts/portal-sync/dist/${name}  (${(href.length / 1024).toFixed(1)} KB bookmarklet` +
    (diagOnly ? ", no credentials" : `, PIN ${pin}`) + ")"
);
