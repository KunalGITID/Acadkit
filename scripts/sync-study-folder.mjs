#!/usr/bin/env node
/** Mirror the study folder on this Mac into the private `study-files` bucket (migration 025), so the Files page can show it on any device. */
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { applyDeletions } from "./apply-study-deletions.mjs";
import { applyUploads } from "./apply-study-uploads.mjs";
import { indexStudyFolder } from "./study-index/index.mjs";
import { buildRenditions } from "./lib/renditions.mjs";
import { subjectIndex, tagFile } from "./lib/tags.mjs";
import { mineTopics } from "./study-index/topics.mjs";
import { buildUnits } from "./study-index/units.mjs";

const BUCKET = "study-files";
const MAX_BYTES = 50 * 1024 * 1024;
const dryRun = process.argv.includes("--dry-run");
const noIndex = process.argv.includes("--no-index");
const reindex = process.argv.includes("--reindex");

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

/** The weekly scan's findings, validated. */
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

// Files deleted in the app (migration 032) go to the Trash first, and files
// uploaded from it (033) are saved in, so the manifest below reflects both.
for (const [apply, what] of [[applyDeletions, "deletions"], [applyUploads, "uploads"]]) {
  try {
    await apply({ supabase, pin, dir, dryRun });
  } catch (err) {
    console.error(`${err.message}. Syncing without applying ${what}.`);
  }
}

const files = [];
const skippedLarge = [];
const walked = (await walk(dir)).sort();
// Subject, unit and kind, read off each path (scripts/lib/tags.mjs). A
// subject folder named by title alone ("Operating_Systems") finds its code
// through the curriculum's course titles.
const courseTitles = new Map();
try {
  const cur = JSON.parse(await readFile(path.join(dir, "_src", "acadkit_curriculum.json"), "utf8"));
  for (const s of cur.semesters ?? []) for (const c of s.courses ?? []) if (c.code && c.title) courseTitles.set(c.code, c.title);
} catch {
  /* no curriculum: folders must carry their code */
}
const subjects = subjectIndex([...new Set(walked.filter((r) => r.includes("/")).map((r) => r.split("/")[0]))], courseTitles);
for (const rel of walked) {
  const full = path.join(dir, rel);
  const info = await stat(full);
  if (info.size > MAX_BYTES) {
    skippedLarge.push(`${rel} (${mb(info.size)})`);
    continue;
  }
  const bytes = await readFile(full);
  const sha = createHash("sha256").update(bytes).digest("hex");
  const ext = path.extname(rel).slice(1).toLowerCase();
  files.push({
    path: rel,
    size: info.size,
    mtime: Math.round(info.mtimeMs),
    key: `${pin}/blobs/${sha}${ext ? "." + ext : ""}`,
    ...tagFile(rel, subjects),
    ext,
    full,
  });
}

// .doc and .ppt have no reader in the browser, so the app's viewer shows a
// converted copy (scripts/lib/renditions.mjs); the original stays the download.
const previews = [];
for (const [rel, r] of await buildRenditions(files)) {
  const f = files.find((x) => x.path === rel);
  const key = `${pin}/blobs/${r.sha}.${r.ext}`;
  f.preview = { key, ext: r.ext };
  previews.push({ path: `${rel} (preview)`, key, full: r.full, ext: r.ext, size: 0 });
}

// The folder's own notes (a PDF built from _src/<same>.md) have a web version in _src/_html/ (md2pdf.py).
for (const f of files) {
  if (f.ext !== "pdf" || f.preview) continue;
  const html = path.join(dir, "_src", "_html", f.path.replace(/\.pdf$/i, ".html"));
  let bytes;
  try {
    bytes = await readFile(html);
  } catch {
    continue;
  }
  const sha = createHash("sha256").update(bytes).digest("hex");
  const key = `${pin}/blobs/${sha}.html`;
  f.preview = { key, ext: "html" };
  previews.push({ path: `${f.path} (web)`, key, full: html, ext: "html", size: 0 });
}

const blobs = [...files, ...previews];
const wanted = new Set(blobs.map((f) => f.key));
const toUpload = [...new Map(blobs.filter((f) => !remoteKeys.has(f.key)).map((f) => [f.key, f])).values()];
const toRemove = [...remoteKeys].filter((k) => !wanted.has(k));

console.log(`${path.basename(dir)}: ${files.length} files, ${mb(files.reduce((s, f) => s + f.size, 0))}`);
console.log(`Upload ${toUpload.length} (${mb(toUpload.reduce((s, f) => s + f.size, 0))}), remove ${toRemove.length}`);
for (const s of skippedLarge) console.log(`  skipped, over 50 MB: ${s}`);

/** Exam prep: { tests: [{ subject_code, label, due_date, title, portion, pattern, papers, topics: [{ topic, unit, seen, of }], files: [{ path, why }] }] }. */
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
  if (!noIndex) {
    await indexStudyFolder({ supabase, pin, files, url, key: serviceKey, reindex, dryRun: true });
  }
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
  files: files.map(({ path: p, size, mtime, key, subject_code, unit, kind, preview }) => ({
    path: p, size, mtime, key, subject_code, unit, kind, ...(preview ? { preview } : {}),
  })),
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

// The degree's curriculum (_src/acadkit_curriculum.json), for History's
// degree plan and semester setup. Refused if its credits don't add up:
// a typo there would move every graduation number.
{
  let cur = null;
  try {
    cur = JSON.parse(await readFile(path.join(dir, "_src", "acadkit_curriculum.json"), "utf8"));
  } catch {
    /* none */
  }
  if (cur) {
    const perSem = (cur.semesters ?? []).map((s) => [s.n, s.credits, (s.courses ?? []).reduce((n, c) => n + (c.credits ?? 0), 0)]);
    const bad = perSem.filter(([, want, got]) => want !== got);
    const total = perSem.reduce((n, [, , got]) => n + got, 0);
    if (bad.length || total !== cur.total_credits) {
      console.error(`Curriculum not sent: credits don't add up (${bad.map(([n, w, g]) => `sem ${n}: ${g} not ${w}`).join(", ") || `total ${total} not ${cur.total_credits}`}).`);
    } else {
      const { error } = await bucket.upload(`${pin}/curriculum.json`, JSON.stringify(cur), {
        contentType: "application/json",
        upsert: true,
        cacheControl: "0",
      });
      if (error) console.error(`Couldn't write the curriculum: ${error.message}`);
      else console.log(`Curriculum: ${cur.semesters.length} semesters, ${cur.total_credits} credits.`);
    }
  }
}

// Unit-by-unit syllabi (_src/acadkit_syllabi.json), for unit-level views.
{
  let raw = null;
  try {
    raw = await readFile(path.join(dir, "_src", "acadkit_syllabi.json"), "utf8");
  } catch {
    /* none */
  }
  if (raw) {
    const { error } = await bucket.upload(`${pin}/syllabi.json`, raw, {
      contentType: "application/json",
      upsert: true,
      cacheControl: "0",
    });
    if (error) console.error(`Couldn't write the syllabi: ${error.message}`);
    else console.log(`Syllabi: ${Object.keys(JSON.parse(raw).courses ?? {}).length} courses.`);
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

// Insert-or-ignore on (device_id, key): a finding the app has already seen keeps whatever you decided about it.
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
      // 'withdrawn', not 'dismissed': this is the scan's clean-up, not your decision, and the app's suggestion ranker learns from your decisions only (migration 029).
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

/** Where to study a past-paper topic: the passages nearest its typical question, from the same subject's own files, one per file, three at most. */
const MIN_LINK_SIMILARITY = 0.8;
const LINK_TIER = { notes: 0, guide: 0, lab: 0, assignment: 0, whatsapp: 1, other: 1 };
const fileByKey = new Map(files.map((f) => [f.key, f]));
async function linkTopic(vector, subjectCode) {
  const { data, error } = await supabase.rpc("match_study_chunks", {
    p_device: pin,
    query_embedding: vector,
    match_count: 50,
  });
  if (error) throw new Error(error.message);
  const best = new Map(); // path → first (closest) hit
  for (const hit of data ?? []) {
    if (hit.similarity < MIN_LINK_SIMILARITY) break; // sorted by similarity
    const f = fileByKey.get(hit.file_key);
    if (!f || f.subject_code !== subjectCode || !(f.kind in LINK_TIER) || best.has(f.path)) continue;
    best.set(f.path, { path: f.path, page: hit.page ?? null, tier: LINK_TIER[f.kind] });
  }
  // Stable: within a tier, still closest first.
  return [...best.values()]
    .sort((a, b) => a.tier - b.tier)
    .slice(0, 3)
    .map(({ path: p, page }) => ({ path: p, page }));
}

// Search by meaning (migration 030): read, cut and embed whatever is new.
// Last, and never fatal - the files above are synced either way.
if (!noIndex) {
  try {
    await indexStudyFolder({ supabase, pin, files, url, key: serviceKey, reindex });
  } catch (err) {
    console.error(`Search index: stopped — ${err.message}. The files synced; run again to finish indexing.`);
  }
}

// Syllabus units (_src/acadkit_syllabi.json, units.mjs): where your notes
// cover each unit. Written as <pin>/units.json. Needs the index above, so
// it runs after it; never fatal.
let unitVectors = null;
let syllabi = null;
{
  let courses = null;
  try {
    courses = JSON.parse(await readFile(path.join(dir, "_src", "acadkit_syllabi.json"), "utf8")).courses;
  } catch {
    /* no syllabi */
  }
  if (courses) {
    try {
      const built = await buildUnits({ courses, files, supabase, pin, url, key: serviceKey });
      unitVectors = built.unitVectors;
      syllabi = built.syllabi;
      const { error } = await bucket.upload(`${pin}/units.json`, JSON.stringify(built.units), {
        contentType: "application/json",
        upsert: true,
        cacheControl: "0",
      });
      if (error) console.error(`Couldn't write units: ${error.message}`);
    } catch (err) {
      console.error(`Units: stopped — ${err.message}`);
    }
  }
}

if (!noIndex) {
  // Past-paper topics: which questions keep coming back, by how many
  // papers asked them. Written as <pin>/topics.json for Exam prep.
  try {
    const topics = await mineTopics({ files, url, key: serviceKey, link: linkTopic, unitVectors, syllabi });
    if (topics) {
      const { error } = await bucket.upload(`${pin}/topics.json`, JSON.stringify(topics), {
        contentType: "application/json",
        upsert: true,
        cacheControl: "0",
      });
      if (error) console.error(`Couldn't write topics: ${error.message}`);
      else {
        const n = topics.subjects.reduce((a, t) => a + t.topics.length, 0);
        console.log(`Topics: ${n} repeated topics across ${topics.subjects.length} subjects.`);
      }
    }
  } catch (err) {
    console.error(`Topics: stopped — ${err.message}`);
  }
}

console.log(`Synced. ${files.length} files are on the Files page.`);
