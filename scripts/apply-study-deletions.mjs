#!/usr/bin/env node
/** Act on files deleted from the app's Files page (migration 032). */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile, rename, rmdir, stat, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { dropFromPrep, resolveRequest, shaOfKey, sourceOf, trashName, webVersionOf } from "./lib/deletions.mjs";

const TRASH = path.join(homedir(), ".Trash");

async function toTrash(full) {
  const name = trashName(path.basename(full), (n) => existsSync(path.join(TRASH, n)));
  await rename(full, path.join(TRASH, name));
  return name;
}

/**
 * A folder deleted in the app arrives as one request per file; once they
 * are all in the Trash, the folders they leave empty go too (up to, never
 * including, `stop`). A Finder .DS_Store doesn't count as content.
 */
async function pruneEmpty(dirPath, stop) {
  for (let d = dirPath; d.startsWith(stop + path.sep); d = path.dirname(d)) {
    let names;
    try {
      names = await readdir(d);
    } catch {
      return;
    }
    if (names.some((n) => n !== ".DS_Store")) return;
    if (names.length) await unlink(path.join(d, ".DS_Store"));
    await rmdir(d);
  }
}

export async function applyDeletions({ supabase, pin, dir, dryRun = false, log = console.log }) {
  const { data, error } = await supabase
    .from("study_file_deletions")
    .select("id, path, key")
    .eq("device_id", pin)
    .eq("status", "pending")
    .order("requested_at");
  if (error) {
    // Before migration 032 there is simply nothing to do.
    if (/study_file_deletions/.test(error.message)) return 0;
    throw new Error(`Couldn't read delete requests: ${error.message}`);
  }
  let moved = 0;
  const gone = new Set();
  for (const req of data ?? []) {
    const finish = (status, note) =>
      dryRun
        ? Promise.resolve()
        : supabase
            .from("study_file_deletions")
            .update({ status, note, done_at: new Date().toISOString() })
            .eq("id", req.id)
            .then(({ error: e }) => e && log(`  couldn't update request for ${req.path}: ${e.message}`));

    const target = resolveRequest(dir, req.path);
    if (target.error) {
      log(`  skip ${req.path}: ${target.error}`);
      await finish("skipped", target.error);
      continue;
    }
    let info;
    try {
      info = await stat(target.full);
    } catch {
      log(`  gone already: ${req.path}`);
      await finish("done", "already gone from the Mac");
      continue;
    }
    if (!info.isFile()) {
      await finish("skipped", "not a file");
      continue;
    }
    const sha = createHash("sha256").update(await readFile(target.full)).digest("hex");
    if (sha !== shaOfKey(req.key)) {
      log(`  skip ${req.path}: changed on the Mac since you deleted it in the app`);
      await finish("skipped", "it changed on the Mac after you deleted it in the app");
      continue;
    }
    if (dryRun) {
      log(`  - ${req.path} (would move to the Trash)`);
      continue;
    }
    const name = await toTrash(target.full);
    const src = sourceOf(req.path);
    let alsoSrc = "";
    if (src) {
      const s = resolveRequest(path.join(dir, "_src"), src.slice("_src/".length));
      if (s.full && existsSync(s.full)) {
        alsoSrc = ` and its source ${await toTrash(s.full)}`;
        await pruneEmpty(path.dirname(s.full), path.join(dir, "_src"));
      }
      // Its web version too, or the next sync would still attach it to nothing.
      const web = webVersionOf(req.path);
      const w = web && resolveRequest(path.join(dir, "_src", "_html"), web.slice("_src/_html/".length));
      if (w?.full && existsSync(w.full)) {
        await toTrash(w.full);
        await pruneEmpty(path.dirname(w.full), path.join(dir, "_src", "_html"));
      }
    }
    await pruneEmpty(path.dirname(target.full), dir);
    log(`  - ${req.path} → Trash as ${name}${alsoSrc}`);
    await finish("done", `moved to the Trash as ${name}${alsoSrc}`);
    gone.add(req.path);
    moved++;
  }
  // Exam prep stops pointing at what was just deleted.
  if (gone.size) {
    const prepFile = path.join(dir, "_src", "acadkit_prep.json");
    try {
      const { prep, removed } = dropFromPrep(JSON.parse(await readFile(prepFile, "utf8")), gone);
      if (removed) {
        await writeFile(prepFile, JSON.stringify(prep, null, 2) + "\n");
        log(`  Exam prep: removed ${removed} link${removed === 1 ? "" : "s"} to deleted files`);
      }
    } catch {
      /* no prep file, or not ours to fix: the sync reports bad links anyway */
    }
  }
  if (moved) log(`Moved ${moved} to the Trash`);
  return moved;
}

// Run directly: npm run sync:deletions
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const pin = process.env.STUDY_PIN;
  if (!url || !key || !/^\d{4}$/.test(pin ?? "")) {
    console.error("Add VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and STUDY_PIN to .env.local.");
    process.exit(1);
  }
  const dir = (process.env.STUDY_DIR || "~/Documents/SRM_Sem3").replace(/^~(?=$|\/)/, homedir());
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  await applyDeletions({ supabase, pin, dir, dryRun: process.argv.includes("--dry-run") });
}
