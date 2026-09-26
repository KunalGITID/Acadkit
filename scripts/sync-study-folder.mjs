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
 * suggestions the app offers — never as deadlines or plans directly —
 * and _src/acadkit_prep.json (see readPrep) as <pin>/prep.json, which
 * the Study page's Exam prep reads.
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
        // The old date when the scan saw this test move; the app then
        // offers Move on the existing deadline instead of Add.
        moved_from: d.moved_from && !Number.isNaN(new Date(d.moved_from).getTime()) ? d.moved_from : null,
      },
      source: d.source ? String(d.source).slice(0, 300) : null,
      evidence: d.evidence ? String(d.evidence).slice(0, 200) : null,
    });
  }
  // Marks plans: { subject_code, internal, components: [{ label, type, max }] }.
  // Keyed on the plan's content, so a plan that changes is a new offer
  // and one that hasn't can't come back after being dismissed.
  const KINDS = new Set(["CT", "Lab", "Assignment", "Project"]);
  for (const [i, p] of (JSON.parse(raw).plans ?? []).entries()) {
    const comps = Array.isArray(p.components) ? p.components : [];
    const sum = comps.reduce((s, c) => s + Number(c.max || 0), 0);
    const problem = !p.subject_code
      ? "subject_code"
      : !(p.internal > 0 && p.internal <= 100)
        ? "internal"
        : comps.length === 0 || comps.some((c) => !String(c.label ?? "").trim() || !KINDS.has(c.type) || !(Number(c.max) > 0))
          ? "components"
          : sum > p.internal
            ? `components (they add to ${sum}, more than internal ${p.internal})`
            : null;
    if (problem) {
      bad.push(`plan #${i + 1} ${p.subject_code ?? ""}: bad ${problem}`);
      continue;
    }
    const components = comps.map((c) => ({ label: String(c.label).trim(), type: c.type, max: Number(c.max) }));
    const sig = `${squash(p.subject_code)}|${p.internal}|${components.map((c) => `${squash(c.label)}:${c.type}:${c.max}`).join(",")}`;
    rows.push({
      device_id: pin,
      key: createHash("sha256").update(`plan|${sig}`).digest("hex").slice(0, 32),
      kind: "plan",
      payload: { subject_code: p.subject_code, internal: Number(p.internal), components },
      source: p.source ? String(p.source).slice(0, 300) : null,
      evidence: p.evidence ? String(p.evidence).slice(0, 200) : null,
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

/**
 * Exam prep: { tests: [{ subject_code, label, due_date, title, portion,
 * pattern, papers, topics: [{ topic, unit, seen, of }], files: [{ path,
 * why }] }] }. Files are study-folder paths; any that aren't in this sync
 * are dropped with a warning rather than shipped as dead links.
 */
async function readPrep(root, known) {
  let raw;
  try {
    raw = await readFile(path.join(root, "_src", "acadkit_prep.json"), "utf8");
  } catch {
    return null;
  }
  const data = JSON.parse(raw);
  const warnings = [];
  const tests = [];
  for (const t of data.tests ?? []) {
    if (!t.subject_code || Number.isNaN(new Date(t.due_date).getTime()) || !/(Z|[+-]\d\d:\d\d)$/.test(t.due_date ?? "")) {
      warnings.push(`prep ${t.subject_code ?? "?"} ${t.label ?? ""}: needs subject_code and a due_date with a time zone`);
      continue;
    }
    const files = (t.files ?? []).filter((f) => {
      const ok = known.has(f.path);
      if (!ok) warnings.push(`prep ${t.subject_code} ${t.label ?? ""}: no such file ${f.path}`);
      return ok;
    });
    tests.push({ ...t, files, topics: (t.topics ?? []).filter((x) => x.topic) });
  }
  return { body: { version: 1, generatedAt: Date.now(), tests }, warnings };
}

const found = await readSuggestions(dir);
const prep = await readPrep(dir, new Set(files.map((f) => f.path)));
if (prep) console.log(`Exam prep: ${prep.body.tests.length} tests${prep.warnings.length ? `, ${prep.warnings.length} warning(s)` : ""}`);
for (const w of prep?.warnings ?? []) console.log(`  ${w}`);
if (found.rows.length || found.bad.length)
  console.log(`Suggestions from the scan: ${found.rows.length} valid${found.bad.length ? `, ${found.bad.length} skipped` : ""}`);
for (const b of found.bad) console.log(`  skipped suggestion ${b}`);

if (dryRun) {
  for (const f of toUpload) console.log(`  + ${f.path}`);
  for (const r of found.rows)
    console.log(r.kind === "plan"
      ? `  ? plan ${r.payload.subject_code}: ${r.payload.components.map((c) => `${c.label} ${c.max}`).join(" · ")}`
      : `  ? ${r.payload.subject_code ?? "-"} ${r.payload.label ?? r.payload.type} ${r.payload.due_date}`);
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

if (prep) {
  const { error } = await bucket.upload(`${pin}/prep.json`, JSON.stringify(prep.body), {
    contentType: "application/json",
    upsert: true,
    cacheControl: "0",
  });
  if (error) console.error(`Couldn't write exam prep: ${error.message}`);
}

// Only now that nothing points at them.
for (let i = 0; i < toRemove.length; i += 100) {
  const { error } = await bucket.remove(toRemove.slice(i, i + 100));
  if (error) console.error(`  couldn't remove old files: ${error.message} (harmless, retried next run)`);
}

// Insert-or-ignore on (device_id, key): a finding the app has already
// seen keeps whatever you decided about it.
// The scan rewrites the whole file each week, so a pending suggestion
// it no longer contains is stale — most often a date that moved, whose
// new date arrives as a new key. Leaving the old one would show both.
// Only pending rows are touched: anything you added or dismissed stays.
{
  const current = new Set(found.rows.map((r) => r.key));
  const { data: pending, error } = await supabase
    .from("suggestions")
    .select("id,key,kind")
    .eq("device_id", pin)
    .eq("status", "pending");
  if (!error) {
    const kinds = new Set(found.rows.map((r) => r.kind));
    const stale = pending.filter((p) => kinds.has(p.kind) && !current.has(p.key)).map((p) => p.id);
    if (stale.length && !dryRun) {
      // 'withdrawn', not 'dismissed': this is the scan's clean-up, not your
      // decision, and the app's suggestion ranker learns from your
      // decisions only (migration 029). Before 029 the status doesn't
      // exist, so fall back to the old behaviour.
      let { error: e2 } = await supabase.from("suggestions").update({ status: "withdrawn" }).in("id", stale);
      if (e2 && /check constraint|violates/i.test(e2.message)) {
        ({ error: e2 } = await supabase.from("suggestions").update({ status: "dismissed" }).in("id", stale));
      }
      if (e2) console.error(`Couldn't withdraw stale suggestions: ${e2.message}`);
    }
    if (stale.length) console.log(`Withdrawn (no longer in the scan): ${stale.length}`);
  }
}

// Sent per kind, so a project that hasn't run migration 027 (which
// allows 'plan') still gets its deadlines.
for (const [kind, migration] of [["deadline", "026"], ["plan", "027"]]) {
  const rows = found.rows.filter((r) => r.kind === kind);
  if (!rows.length) continue;
  const { data, error } = await supabase
    .from("suggestions")
    .upsert(rows, { onConflict: "device_id,key", ignoreDuplicates: true })
    .select("id");
  if (error) console.error(`Couldn't send ${kind} suggestions: ${error.message}. Has migration ${migration} been run?`);
  else console.log(`${kind === "plan" ? "Marks plans" : "Deadlines"}: ${data.length} new, ${rows.length - data.length} already known.`);
}

console.log(`Synced. ${files.length} files are on the Files page.`);
