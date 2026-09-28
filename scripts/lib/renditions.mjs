/** Readable copies of the binary Office formats, for the app's file viewer. */
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, rename, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const CACHE = path.join(homedir(), "Library", "Caches", "AcadKit", "renditions");
const SOFFICE = ["/Applications/LibreOffice.app/Contents/MacOS/soffice", "soffice"];

/** What each legacy format becomes. */
export const RENDITION = { doc: "docx", ppt: "pdf", xls: "xlsx" };

const exec = promisify(execFile);

/**
 * Convert every legacy file in `files` ({ path, full, key, ext }), returning
 * path → { full, ext, sha } of the converted copy. `run(cmd, args)` and
 * `exists(file)` are injectable for tests.
 */
export async function buildRenditions(files, { run = exec, exists = fileExists, cacheDir = CACHE, log = console.log } = {}) {
  const legacy = files.filter((f) => RENDITION[f.ext]);
  const out = new Map();
  if (legacy.length === 0) return out;
  await mkdir(cacheDir, { recursive: true });
  let soffice;
  const missing = new Set();
  for (const f of legacy) {
    const to = RENDITION[f.ext];
    const srcSha = path.basename(f.key).replace(/\.[^.]+$/, "");
    const cached = path.join(cacheDir, `${srcSha}.${to}`);
    if (!(await exists(cached))) {
      try {
        if (f.ext === "doc") {
          await run("textutil", ["-convert", "docx", "-output", cached, f.full]);
        } else {
          soffice ??= await findSoffice(run);
          if (!soffice) {
            missing.add("LibreOffice (for .ppt and .xls)");
            continue;
          }
          // soffice names its output after the input, so convert in a
          // scratch folder and move the result into the cache.
          const tmp = await mkdtemp(path.join(tmpdir(), "acadkit-convert-"));
          try {
            await run(soffice, ["--headless", "--convert-to", to, "--outdir", tmp, f.full]);
            const made = path.join(tmp, `${path.basename(f.full).replace(/\.[^.]+$/, "")}.${to}`);
            // soffice exits 0 on a file it couldn't load; the missing
            // output is the only sign.
            if (!(await exists(made))) throw new Error("LibreOffice couldn't read it");
            await rename(made, cached);
          } finally {
            await rm(tmp, { recursive: true, force: true });
          }
        }
      } catch (err) {
        if (err?.code === "ENOENT") missing.add(f.ext === "doc" ? "textutil (for .doc)" : "LibreOffice (for .ppt and .xls)");
        else log(`  couldn't convert ${f.path}: ${err?.message ?? err}`);
        continue;
      }
    }
    try {
      const sha = createHash("sha256").update(await readFile(cached)).digest("hex");
      out.set(f.path, { full: cached, ext: to, sha });
    } catch {
      // The converter reported success and wrote nothing: no preview.
    }
  }
  for (const m of missing) log(`  no ${m} on this Mac: those files open as downloads only`);
  return out;
}

async function findSoffice(run) {
  for (const cmd of SOFFICE) {
    try {
      await run(cmd, ["--version"]);
      return cmd;
    } catch {
      // try the next
    }
  }
  return null;
}

async function fileExists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}
