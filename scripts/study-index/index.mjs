/**
 * Keep the search index (study_chunks, migration 030) in step with the
 * study folder.
 *
 * A file is indexed once per content hash: a rename or move changes the
 * manifest, not the index. New files are read (text.mjs), cut into
 * passages (chunk.mjs), embedded (embed.mjs) and stored; files gone from
 * the folder have their passages removed. A file is written all or
 * nothing, so a failed run can't leave half a file looking indexed.
 */
import { chunkPages, titleFor } from "./chunk.mjs";
import { embedTexts } from "./embed.mjs";
import { extractText, extractable } from "./text.mjs";

/** Formats whose pages mean something to open at. */
const PAGED = new Set(["pdf", "pptx"]);
/** A 300-page book is searchable enough from its first 400 passages. */
const MAX_CHUNKS_PER_FILE = 400;
const INSERT_BATCH = 100;

const shaOf = (key) => key.slice(key.lastIndexOf("/") + 1).split(".")[0];
const missingTable = (e) => e?.code === "42P01" || e?.code === "PGRST205";

/** The file keys that already have passages. */
async function indexedKeys(supabase, pin) {
  const keys = new Set();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("study_chunks")
      .select("file_key")
      .eq("device_id", pin)
      .eq("chunk_index", 0)
      .range(from, from + 999);
    if (error) throw error;
    for (const r of data) keys.add(r.file_key);
    if (data.length < 1000) break;
  }
  return keys;
}

export async function indexStudyFolder({ supabase, pin, files, url, key, reindex = false, dryRun = false, log = console.log }) {
  let indexed;
  try {
    indexed = await indexedKeys(supabase, pin);
  } catch (err) {
    if (missingTable(err)) {
      log("Search index: skipped — run migration 030 (study search) first.");
      return null;
    }
    throw err;
  }

  // One entry per content: the same file in two folders is indexed once.
  const byKey = new Map();
  for (const f of files) if (extractable(f.ext) && !byKey.has(f.key)) byKey.set(f.key, f);
  const todo = [...byKey.values()].filter((f) => reindex || !indexed.has(f.key));
  const gone = [...indexed].filter((k) => !byKey.has(k));
  log(`Search index: ${byKey.size} readable files · ${todo.length} to index · ${gone.length} to drop`);
  if (dryRun) return { todo: todo.length, gone: gone.length };

  const noText = [];
  let passages = 0;
  let done = 0;
  for (const f of todo) {
    const { pages, ocr } = await extractText(f.full, f.ext, shaOf(f.key));
    const chunks = chunkPages(pages).slice(0, MAX_CHUNKS_PER_FILE);
    done++;
    if (chunks.length === 0) {
      noText.push(f.path);
      continue;
    }
    const title = titleFor(f.path);
    const paged = PAGED.has(f.ext);
    const vectors = await embedTexts(
      chunks.map((c) => `${title}${paged ? ` (p. ${c.page})` : ""}\n${c.content}`),
      { url, key }
    );

    const { error: delErr } = await supabase.from("study_chunks").delete().eq("device_id", pin).eq("file_key", f.key);
    if (delErr) throw delErr;
    const rows = chunks.map((c, i) => ({
      device_id: pin,
      file_key: f.key,
      chunk_index: c.index,
      page: paged ? c.page : null,
      content: c.content,
      embedding: vectors[i],
    }));
    try {
      for (let i = 0; i < rows.length; i += INSERT_BATCH) {
        const { error } = await supabase.from("study_chunks").insert(rows.slice(i, i + INSERT_BATCH));
        if (error) throw error;
      }
    } catch (err) {
      // All or nothing: a half-written file would look indexed next time.
      await supabase.from("study_chunks").delete().eq("device_id", pin).eq("file_key", f.key);
      throw err;
    }
    passages += rows.length;
    const scanned = ocr.some(Boolean) ? " (OCR)" : "";
    log(`  ✓ ${done}/${todo.length} ${f.path} — ${rows.length} passages${scanned}`);
  }

  for (let i = 0; i < gone.length; i += 100) {
    const { error } = await supabase.from("study_chunks").delete().eq("device_id", pin).in("file_key", gone.slice(i, i + 100));
    if (error) throw error;
  }

  if (noText.length) log(`  No readable text in ${noText.length} file(s): ${noText.slice(0, 5).join(", ")}${noText.length > 5 ? "…" : ""}`);
  log(`Search index: ${passages} passages added from ${todo.length - noText.length} files, ${gone.length} files dropped.`);
  return { indexed: todo.length - noText.length, passages, dropped: gone.length, noText };
}
