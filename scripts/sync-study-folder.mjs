#!/usr/bin/env node
/**
 * Mirror the study folder on this Mac into the private `study-files`
 * bucket (migration 025), so the Files page can show it on any device.
 *
 *   npm run sync:files              upload what changed, remove what's gone
 *   npm run sync:files -- --dry-run show what would change, touch nothing
 *
 * Reads from .env.local:
 *   VITE_SUPABASE_URL           same as the app
 *   SUPABASE_SERVICE_ROLE_KEY   Project Settings → API. Never commit it,
 *                               never prefix it with VITE_ (that would
 *                               put it in the app bundle)
 *   STUDY_PIN                   the 4-digit PIN whose account gets the files
 *   STUDY_DIR                   optional, defaults to ~/Documents/SRM_Sem3
 *
 * Files are stored by content hash, so a rename or move only rewrites the
 * manifest, and an unchanged folder uploads nothing. Anything starting
 * with "." or "_" is skipped (the scan's _src working files and
 * _file_index.csv), as are Office lock files ("~$...").
 */
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "study-files";
const MAX_BYTES = 50 * 1024 * 1024;
const dryRun = process.argv.includes("--dry-run");

const url = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const pin = process.env.STUDY_PIN;
const dir = (process.env.STUDY_DIR || "~/Documents/SRM_Sem3").replace(/^~(?=$|\/)/, homedir());

const missing = [
  !url && "VITE_SUPABASE_URL",
  !serviceKey && "SUPABASE_SERVICE_ROLE_KEY",
  !/^\d{4}$/.test(pin ?? "") && "STUDY_PIN (4 digits)",
].filter(Boolean);
if (missing.length) {
  console.error(`Add ${missing.join(", ")} to .env.local, then run this again.`);
  process.exit(1);
}

const TYPES = {
  pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
  txt: "text/plain; charset=utf-8", md: "text/plain; charset=utf-8", csv: "text/csv; charset=utf-8",
  c: "text/plain; charset=utf-8", py: "text/plain; charset=utf-8", java: "text/plain; charset=utf-8",
  html: "text/html; charset=utf-8",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

async function walk(root, rel = "") {
  const out = [];
  for (const entry of await readdir(path.join(root, rel), { withFileTypes: true })) {
    const name = entry.name;
    if (name.startsWith(".") || name.startsWith("_") || name.startsWith("~$")) continue;
    const child = rel ? `${rel}/${name}` : name;
    if (entry.isDirectory()) out.push(...(await walk(root, child)));
    else if (entry.isFile()) out.push(child);
  }
  return out;
}

const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
const bucket = supabase.storage.from(BUCKET);
const manifestKey = `${pin}/manifest.json`;

// What's already up there. A missing manifest just means first run.
const remoteKeys = new Set();
{
  let offset = 0;
  for (;;) {
    const { data, error } = await bucket.list(`${pin}/blobs`, { limit: 1000, offset });
    if (error) {
      console.error(`Couldn't read the bucket: ${error.message}. Has migration 025 been run?`);
      process.exit(1);
    }
    for (const o of data) remoteKeys.add(`${pin}/blobs/${o.name}`);
    if (data.length < 1000) break;
    offset += data.length;
  }
}

const files = [];
const skippedLarge = [];
for (const rel of (await walk(dir)).sort()) {
  const full = path.join(dir, rel);
  const info = await stat(full);
  if (info.size > MAX_BYTES) {
    skippedLarge.push(`${rel} (${mb(info.size)})`);
    continue;
  }
  const bytes = await readFile(full);
  const sha = createHash("sha256").update(bytes).digest("hex");
  const ext = path.extname(rel).slice(1).toLowerCase();
  files.push({ path: rel, size: info.size, mtime: Math.round(info.mtimeMs), key: `${pin}/blobs/${sha}${ext ? "." + ext : ""}`, ext, full });
}

const wanted = new Set(files.map((f) => f.key));
const toUpload = [...new Map(files.filter((f) => !remoteKeys.has(f.key)).map((f) => [f.key, f])).values()];
const toRemove = [...remoteKeys].filter((k) => !wanted.has(k));

console.log(`${path.basename(dir)}: ${files.length} files, ${mb(files.reduce((s, f) => s + f.size, 0))}`);
console.log(`Upload ${toUpload.length} (${mb(toUpload.reduce((s, f) => s + f.size, 0))}), remove ${toRemove.length}`);
for (const s of skippedLarge) console.log(`  skipped, over 50 MB: ${s}`);

if (dryRun) {
  for (const f of toUpload) console.log(`  + ${f.path}`);
  console.log("Dry run: nothing changed.");
  process.exit(0);
}

let done = 0;
let failed = 0;
const queue = [...toUpload];
async function worker() {
  for (let f = queue.shift(); f; f = queue.shift()) {
    const { error } = await bucket.upload(f.key, await readFile(f.full), {
      contentType: TYPES[f.ext] ?? "application/octet-stream",
      upsert: true,
      cacheControl: "31536000", // content-addressed: a key's bytes never change
    });
    if (error) {
      failed++;
      console.error(`  ✗ ${f.path}: ${error.message}`);
    } else {
      console.log(`  ✓ ${++done}/${toUpload.length} ${f.path}`);
    }
  }
}
await Promise.all(Array.from({ length: 4 }, worker));

if (failed) {
  // Keep the old manifest: it only points at blobs that exist.
  console.error(`${failed} upload(s) failed. The app still shows the previous sync; run this again.`);
  process.exit(1);
}

const manifest = {
  version: 1,
  root: path.basename(dir),
  syncedAt: Date.now(),
  files: files.map(({ path: p, size, mtime, key }) => ({ path: p, size, mtime, key })),
};
{
  const { error } = await bucket.upload(manifestKey, JSON.stringify(manifest), {
    contentType: "application/json",
    upsert: true,
    cacheControl: "0",
  });
  if (error) {
    console.error(`Couldn't write the manifest: ${error.message}`);
    process.exit(1);
  }
}

// Only now that nothing points at them.
for (let i = 0; i < toRemove.length; i += 100) {
  const { error } = await bucket.remove(toRemove.slice(i, i + 100));
  if (error) console.error(`  couldn't remove old files: ${error.message} (harmless, retried next run)`);
}

console.log(`Synced. ${files.length} files are on the Files page.`);
