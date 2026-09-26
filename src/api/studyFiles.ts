import { supabase } from "@/lib/supabase";
import { baseName, opensInBrowser, type StudyFile, type StudyHit, type StudyManifest } from "@/lib/studyFiles";
import type { PrepData } from "@/lib/examPrep";

const BUCKET = "study-files";

/** The synced folder for this PIN, or null if the Mac has never synced. */
export async function fetchStudyManifest(pin: string): Promise<StudyManifest | null> {
  const { data, error } = await supabase.storage.from(BUCKET).download(`${pin}/manifest.json`);
  if (error) {
    // Storage answers "not found" with a 400 whose message says so; that
    // is the empty state, not a failure.
    if (/not.?found|does not exist/i.test(error.message)) return null;
    throw error;
  }
  return JSON.parse(await data.text()) as StudyManifest;
}

const LINK_SECONDS = 60 * 60;

/**
 * Signed links for the files on screen, by storage key. Signed in one
 * batch before any tap, so opening a file is a plain link: a
 * window.open() after an await is a blocked pop-up in Safari.
 *
 * Blobs are named by hash, so types a browser can't show get a download
 * name, or they would save as "3f9a….pptx".
 */
export async function signStudyFiles(files: StudyFile[]): Promise<Record<string, string>> {
  if (files.length === 0) return {};
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(files.map((f) => f.key), LINK_SECONDS);
  if (error) throw error;
  const byKey: Record<string, string> = {};
  const pathOf = new Map(files.map((f) => [f.key, f.path]));
  for (const row of data) {
    if (!row.signedUrl || !row.path) continue;
    const p = pathOf.get(row.path) ?? "";
    byKey[row.path] = opensInBrowser(p)
      ? row.signedUrl
      : `${row.signedUrl}&download=${encodeURIComponent(baseName(p))}`;
  }
  return byKey;
}

/** The scan's exam prep for this PIN, or null before any sync has written it. */
export async function fetchStudyPrep(pin: string): Promise<PrepData | null> {
  const { data, error } = await supabase.storage.from(BUCKET).download(`${pin}/prep.json`);
  if (error) {
    if (/not.?found|does not exist/i.test(error.message)) return null;
    throw error;
  }
  return JSON.parse(await data.text()) as PrepData;
}

/**
 * Passages nearest to a query by meaning, from the study-search edge
 * function (gte-small embeddings, migration 030). It runs as you, so
 * row-level security limits it to your own files.
 */
export async function searchStudyFiles(pin: string, query: string): Promise<StudyHit[]> {
  const { data, error } = await supabase.functions.invoke("study-search", {
    body: { query, device_id: pin, limit: 24 },
  });
  if (error) throw error;
  return (data as { results?: StudyHit[] } | null)?.results ?? [];
}
