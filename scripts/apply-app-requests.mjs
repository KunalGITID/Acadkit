#!/usr/bin/env node
/** Everything the app asks of the Mac, in one go. */
import { homedir } from "node:os";
import path from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { applyDeletions } from "./apply-study-deletions.mjs";
import { applyUploads } from "./apply-study-uploads.mjs";

const HEARTBEAT_EVERY = 30 * 60_000;
const STATE = path.join(homedir(), "Library", "Application Support", "AcadKit", "last-heartbeat");

export async function heartbeat({ supabase, pin, force = false }) {
  const last = Number(await readFile(STATE, "utf8").catch(() => "0")) || 0;
  if (!force && Date.now() - last < HEARTBEAT_EVERY) return;
  const at = Date.now();
  const { error } = await supabase.storage
    .from("study-files")
    .upload(`${pin}/heartbeat.json`, JSON.stringify({ at }), {
      contentType: "application/json",
      upsert: true,
      cacheControl: "0",
    });
  if (error) throw new Error(`Couldn't write the heartbeat: ${error.message}`);
  await mkdir(path.dirname(STATE), { recursive: true });
  await writeFile(STATE, String(at));
}

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const pin = process.env.STUDY_PIN;
if (!url || !key || !/^\d{4}$/.test(pin ?? "")) {
  console.error("Add VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and STUDY_PIN to .env.local.");
  process.exit(1);
}
const dir = (process.env.STUDY_DIR || "~/Documents/SRM_Sem3").replace(/^~(?=$|\/)/, homedir());
const supabase = createClient(url, key, { auth: { persistSession: false } });

let failed = false;
for (const step of [
  () => applyDeletions({ supabase, pin, dir }),
  () => applyUploads({ supabase, pin, dir }),
  () => heartbeat({ supabase, pin }),
]) {
  try {
    await step();
  } catch (err) {
    console.error(err.message);
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
