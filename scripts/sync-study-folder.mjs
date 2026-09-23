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
 * Also uploads what the weekly scan found in the folder, if it wrote
 * _src/acadkit_suggestions.json (see readSuggestions below), as
 * suggestions the app offers — never as deadlines directly.
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

/**
 * The weekly scan's findings, validated. Shape:
 *
 *   { "deadlines": [{ "subject_code": "21CSC201J" | null,
 *                     "type": "exam" | "assignment" | "lab" | "other",
 *                     "label": "FJ-2" | null,
 *                     "due_date": "2026-10-14T09:30:00+05:30",
 *                     "max_marks": 15 | null,
 *                     "source": "DSA_21CSC201J/06_Notes_from_WhatsApp.pdf",
 *                     "evidence": "FJ-2 on 14 Oct, units 2 and 3" }] }
 *
 * A row that fails validation is reported and skipped, never guessed at:
 * a date without a time zone would land 5½ hours off.
 */
const TYPES_OK = new Set(["exam", "assignment", "lab", "other"]);
const squash = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
async function readSuggestions(root) {
  let raw;
  try {
    raw = await readFile(path.join(root, "_src", "acadkit_suggestions.json"), "utf8");
  } catch {
    return { rows: [], bad: [] };
  }
  const rows = [];
  const bad = [];
  for (const [i, d] of (JSON.parse(raw).deadlines ?? []).entries()) {
    const due = new Date(d.due_date);
    const problem = !TYPES_OK.has(d.type)
      ? "type"
      : typeof d.due_date !== "string" || !/(Z|[+-]\d\d:\d\d)$/.test(d.due_date) || Number.isNaN(due.getTime())
        ? "due_date (needs a time zone, e.g. +05:30)"
        : d.max_marks != null && !(Number(d.max_marks) > 0)
          ? "max_marks"
          : null;
    if (problem) {
      bad.push(`#${i + 1} ${d.subject_code ?? ""} ${d.label ?? d.type ?? ""}: bad ${problem}`);
      continue;
    }
    const day = due.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const what = squash(d.label) || d.type;
    const key = createHash("sha256").update(`deadline|${squash(d.subject_code)}|${what}|${day}`).digest("hex").slice(0, 32);
    rows.push({
      device_id: pin,
      key,
      kind: "deadline",
      payload: {
        subject_code: d.subject_code ?? null,
        type: d.type,
        label: d.label ?? null,
        due_date: d.due_date,
        max_marks: d.max_marks == null ? null : Number(d.max_marks),
      },
      source: d.source ? String(d.source).slice(0, 300) : null,
      evidence: d.evidence ? String(d.evidence).slice(0, 200) : null,
    });
  }
  // Two rows the scan wrote twice would fail the whole batch on the
  // unique key; the first wins.
  const unique = new Map();
  for (const r of rows) if (!unique.has(r.key)) unique.set(r.key, r);
  return { rows: [...unique.values()], bad };
}

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

const found = await readSuggestions(dir);
if (found.rows.length || found.bad.length)
  console.log(`Suggestions from the scan: ${found.rows.length} valid${found.bad.length ? `, ${found.bad.length} skipped` : ""}`);
for (const b of found.bad) console.log(`  skipped suggestion ${b}`);

if (dryRun) {
  for (const f of toUpload) console.log(`  + ${f.path}`);
  for (const r of found.rows) console.log(`  ? ${r.payload.subject_code ?? "-"} ${r.payload.label ?? r.payload.type} ${r.payload.due_date}`);
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

// Insert-or-ignore on (device_id, key): a finding the app has already
// seen keeps whatever you decided about it.
if (found.rows.length) {
  const { data, error } = await supabase
    .from("suggestions")
    .upsert(found.rows, { onConflict: "device_id,key", ignoreDuplicates: true })
    .select("id");
  if (error) console.error(`Couldn't send suggestions: ${error.message}. Has migration 026 been run?`);
  else console.log(`Suggestions: ${data.length} new, ${found.rows.length - data.length} already known.`);
}

console.log(`Synced. ${files.length} files are on the Files page.`);
