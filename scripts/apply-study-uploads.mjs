/** Save files uploaded from the app into the study folder (migration 033). */
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { freeName, resolveRequest } from "./lib/deletions.mjs";

const BUCKET = "study-files";

export async function applyUploads({ supabase, pin, dir, dryRun = false, log = console.log }) {
  const { data, error } = await supabase
    .from("study_uploads")
    .select("id, path, key")
    .eq("device_id", pin)
    .eq("status", "pending")
    .order("created_at");
  if (error) {
    // Before migration 033 there is simply nothing to do.
    if (/study_uploads/.test(error.message)) return 0;
    throw new Error(`Couldn't read uploads: ${error.message}`);
  }
  const bucket = supabase.storage.from(BUCKET);
  let saved = 0;
  for (const up of data ?? []) {
    const finish = (status, note) =>
      dryRun
        ? Promise.resolve()
        : supabase
            .from("study_uploads")
            .update({ status, note, done_at: new Date().toISOString() })
            .eq("id", up.id)
            .then(({ error: e }) => e && log(`  couldn't update upload ${up.path}: ${e.message}`));

    const target = resolveRequest(dir, up.path);
    if (target.error || !String(up.key).startsWith(`${pin}/inbox/`)) {
      log(`  skip upload ${up.path}: ${target.error ?? "not in this PIN's inbox"}`);
      await finish("skipped", target.error ?? "not in this PIN's inbox");
      continue;
    }
    if (dryRun) {
      log(`  + ${up.path} (would save from the app)`);
      continue;
    }
    const { data: blob, error: dlErr } = await bucket.download(up.key);
    if (dlErr || !blob) {
      // Row written before the upload finished, or the upload failed: try again next run.
      log(`  upload ${up.path} not ready yet (${dlErr?.message ?? "empty"})`);
      continue;
    }
    const parent = path.dirname(target.full);
    const name = freeName(path.basename(target.full), (n) => existsSync(path.join(parent, n)), " (%d)");
    await mkdir(parent, { recursive: true });
    await writeFile(path.join(parent, name), Buffer.from(await blob.arrayBuffer()), { flag: "wx" });
    const rel = path.relative(dir, path.join(parent, name)).split(path.sep).join("/");
    log(`  + ${rel} (from the app)`);
    await finish("done", rel === up.path ? "saved" : `saved as ${rel}`);
    const { error: rmErr } = await bucket.remove([up.key]);
    if (rmErr) log(`  couldn't clear the inbox copy of ${rel}: ${rmErr.message}`);
    saved++;
  }
  if (saved) log(`Saved ${saved} from the app`);
  return saved;
}
