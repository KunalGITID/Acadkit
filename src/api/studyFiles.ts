import { supabase } from "@/lib/supabase";
import { cachedFile, storeFile } from "@/lib/fileCache";
import { baseName, type StudyFile, type StudyHit, type StudyManifest } from "@/lib/studyFiles";
import type { PrepData, TopicsData } from "@/lib/examPrep";

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

/** Topics mined from past papers by the sync, or null before it has run. */
export async function fetchStudyTopics(pin: string): Promise<TopicsData | null> {
  const { data, error } = await supabase.storage.from(BUCKET).download(`${pin}/topics.json`);
  if (error) {
    if (/not.?found|does not exist/i.test(error.message)) return null;
    throw error;
  }
  return JSON.parse(await data.text()) as TopicsData;
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

/** A file you deleted in the app, waiting for (or just handled by) the Mac. Migration 032. */
export interface StudyDeletion {
  id: string;
  path: string;
  status: "pending" | "done" | "skipped";
  note: string | null;
  done_at: string | null;
}

/**
 * Open delete requests, plus any the Mac turned down in the last day, so
 * the page can say why a file you deleted is still there.
 */
export async function fetchStudyDeletions(pin: string): Promise<StudyDeletion[]> {
  const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const { data, error } = await supabase
    .from("study_file_deletions")
    .select("id, path, status, note, done_at")
    .eq("device_id", pin)
    .or(`status.eq.pending,and(status.eq.skipped,done_at.gte.${since})`)
    .order("requested_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as StudyDeletion[];
}

/**
 * Ask the Mac to delete a file. It moves it to its Trash at the next sync,
 * but only if the file still has this content (`key`).
 */
export async function requestStudyDeletion(pin: string, file: StudyFile): Promise<void> {
  const { error } = await supabase
    .from("study_file_deletions")
    .insert({ device_id: pin, path: file.path, key: file.key });
  // A second tap on the same file: the request is already open.
  if (error && error.code !== "23505") throw error;
}

/**
 * A folder: one request per file in it, in one insert. Files that already
 * have an open request are left out, since one duplicate would fail the lot.
 */
export async function requestStudyDeletions(pin: string, files: StudyFile[], alreadyPending: Set<string>): Promise<void> {
  const rows = files.filter((f) => !alreadyPending.has(f.path)).map((f) => ({ device_id: pin, path: f.path, key: f.key }));
  if (rows.length === 0) return;
  const { error } = await supabase.from("study_file_deletions").insert(rows);
  if (error && error.code !== "23505") throw error;
}

/** Take back a request the Mac hasn't acted on yet. */
export async function cancelStudyDeletion(id: string): Promise<void> {
  const { error } = await supabase.from("study_file_deletions").delete().eq("id", id).eq("status", "pending");
  if (error) throw error;
}

/** When the Mac last checked in (epoch ms), or null if it never has. Written at most every 30 min. */
export async function fetchMacHeartbeat(pin: string): Promise<number | null> {
  const { data, error } = await supabase.storage.from(BUCKET).download(`${pin}/heartbeat.json`);
  if (error) {
    if (/not.?found|does not exist/i.test(error.message)) return null;
    throw error;
  }
  const at = (JSON.parse(await data.text()) as { at?: number }).at;
  return typeof at === "number" ? at : null;
}

/** A file sent from the app, waiting for the Mac to save it into the folder. Migration 033. */
export interface StudyUpload {
  id: string;
  path: string;
  key: string;
  size: number;
}

export async function fetchPendingUploads(pin: string): Promise<StudyUpload[]> {
  const { data, error } = await supabase
    .from("study_uploads")
    .select("id, path, key, size")
    .eq("device_id", pin)
    .eq("status", "pending")
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as StudyUpload[];
}

/** The bucket's cap (migration 025). */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/**
 * A file name the sync will pick up: no slashes, and not starting with "."
 * or "_" (the sync skips those) or "~$" (Office lock files).
 */
export function safeUploadName(name: string): string {
  // Control characters are exactly what's being removed.
  // eslint-disable-next-line no-control-regex
  let n = name.replace(/[/\\]/g, "-").replace(/[\u0000-\u001f]/g, "").trim();
  if (/^[._]|^~\$/.test(n)) n = `upload-${n.replace(/^[._~$]+/, "")}`;
  return n || "upload";
}

/**
 * Send a file to the Mac's study folder, into `folder` ("" = the top). The
 * bytes go to this PIN's inbox; the row tells the Mac where to put them.
 */
export async function uploadStudyFile(pin: string, folder: string, file: File): Promise<void> {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error(`${file.name} is over 50 MB`);
  const name = safeUploadName(file.name);
  const key = `${pin}/inbox/${crypto.randomUUID()}/${name}`;
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(key, file, { contentType: file.type || "application/octet-stream", upsert: false });
  if (upErr) throw upErr;
  const { error } = await supabase
    .from("study_uploads")
    .insert({ device_id: pin, path: folder ? `${folder}/${name}` : name, key, size: file.size });
  if (error) {
    await supabase.storage.from(BUCKET).remove([key]);
    throw error;
  }
}

/** Take back an upload the Mac hasn't saved yet. */
export async function cancelStudyUpload(u: StudyUpload): Promise<void> {
  const { error } = await supabase.from("study_uploads").delete().eq("id", u.id).eq("status", "pending");
  if (error) throw error;
  await supabase.storage.from(BUCKET).remove([u.key]);
}

/** The degree's curriculum from the study folder, or null if the sync hasn't sent one. */
export async function fetchCurriculum(pin: string): Promise<import("@/lib/curriculum").Curriculum | null> {
  const { data, error } = await supabase.storage.from(BUCKET).download(`${pin}/curriculum.json`);
  if (error) {
    if (/not.?found|does not exist/i.test(error.message)) return null;
    throw error;
  }
  return JSON.parse(await data.text());
}

/** A file's bytes, for the in-app viewer. */
export async function fetchStudyBlob(file: StudyFile, key: string = file.key): Promise<Blob> {
  // Opened before on this device: no download (src/lib/fileCache.ts).
  const hit = await cachedFile(key);
  if (hit) return hit;
  const { data, error } = await supabase.storage.from(BUCKET).download(key);
  if (error) throw error;
  void storeFile(key, data);
  return data;
}

/**
 * The link the viewer's Download button uses: signed, and always carrying
 * the file's real name, since the blob itself is named by its hash.
 */
export async function studyDownloadUrl(file: StudyFile): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(file.key, LINK_SECONDS, { download: baseName(file.path) });
  if (error) throw error;
  return data.signedUrl;
}
