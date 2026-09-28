/** The study-folder tree, as written by scripts/sync-study-folder.mjs. */

export interface StudyFile {
  /** Path inside the synced folder, "/"-separated, e.g. "OS_21CSC202J/02_Notes/Unit1.pdf". */
  path: string;
  size: number;
  /** Last-modified time on the Mac, epoch ms. */
  mtime: number;
  /** Storage object key: "<device_id>/blobs/<sha256>.<ext>". */
  key: string;
  /**
   * Read off the path by the sync (scripts/lib/tags.mjs). Absent in a
   * manifest written before tagging.
   */
  subject_code?: string | null;
  unit?: number | null;
  kind?: FileKind;
  /**
   * A converted copy the viewer can read, for formats no browser can
   * (.doc → .docx, .ppt → .pdf), made on the Mac at sync
   * (scripts/lib/renditions.mjs). Absent when the Mac couldn't convert.
   */
  preview?: { key: string; ext: string } | null;
}

export type FileKind = "notes" | "lab" | "guide" | "pyq" | "syllabus" | "assignment" | "whatsapp" | "other";

export interface StudyManifest {
  version: 1;
  /** Name of the folder on the Mac, e.g. "SRM_Sem3". */
  root: string;
  /** When the sync ran, epoch ms. */
  syncedAt: number;
  files: StudyFile[];
}

export interface FolderEntry {
  name: string;
  /** Full path of the folder, no trailing slash. */
  path: string;
  /** Files anywhere below it. */
  count: number;
}

export interface FolderView {
  folders: FolderEntry[];
  files: StudyFile[];
}

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

export function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

export function extOf(path: string): string {
  const name = baseName(path);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/**
 * A top-level folder of reference rather than daily reading (the syllabus
 * books for every course, `Syllabi/`), which Study lists at the bottom of
 * the page, below the loose files.
 */
export function isReferenceFolder(dir: string, name: string): boolean {
  return !dir && /^syllabi$/i.test(name);
}

/** The immediate children of `dir` ("" is the root). */
export function listFolder(files: StudyFile[], dir: string): FolderView {
  const prefix = dir ? `${dir}/` : "";
  const folders = new Map<string, number>();
  const direct: StudyFile[] = [];
  for (const f of files) {
    if (!f.path.startsWith(prefix)) continue;
    const rest = f.path.slice(prefix.length);
    const slash = rest.indexOf("/");
    if (slash === -1) direct.push(f);
    else {
      const name = rest.slice(0, slash);
      folders.set(name, (folders.get(name) ?? 0) + 1);
    }
  }
  return {
    folders: [...folders]
      .map(([name, count]) => ({ name, path: prefix + name, count }))
      .sort((a, b) => collator.compare(a.name, b.name)),
    files: direct.sort((a, b) => collator.compare(baseName(a.path), baseName(b.path))),
  };
}

/** Files whose path matches every word of the query, in any order and any case - so "os unit 1" finds "OS_21CSC202J/02_Notes/Unit1_OS.pptx". */
export function searchFiles(files: StudyFile[], query: string, limit = 50): StudyFile[] {
  const parts = tokens(query);
  if (parts.length === 0) return [];
  const matches = (hay: string[]) =>
    parts.every((p) => (isNum(p) ? hay.some((t) => isNum(t) && Number(t) === Number(p)) : hay.some((t) => t.startsWith(p))));
  const hits = files.filter((f) => matches(tokens(f.path)));
  // A match in the file's own name beats one only in a folder above it.
  const inName = (f: StudyFile) => matches(tokens(baseName(f.path)));
  return hits
    .sort((a, b) => Number(inName(b)) - Number(inName(a)) || collator.compare(a.path, b.path))
    .slice(0, limit);
}

const isNum = (t: string) => /^\d+$/.test(t);

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/(\d)([a-z])/g, "$1 $2")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** "OS_21CSC202J" → "OS 21CSC202J". Display only; paths keep the original. */
export function prettyName(name: string): string {
  return name.replace(/_/g, " ");
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------- search by meaning (migration 030) ----------

/** One passage the study-search function returned. */
export interface StudyHit {
  file_key: string;
  chunk_index: number;
  /** PDF page or slide, 1-based; null for formats without pages. */
  page: number | null;
  content: string;
  /** Cosine similarity to the query, −1 to 1. */
  similarity: number;
}

export interface FileHits {
  file: StudyFile;
  /** Best first. */
  hits: StudyHit[];
}

/**
 * Passages grouped by file, best file first. A file that has left the
 * folder since it was indexed is dropped rather than shown as a dead
 * link, and one path per content hash is enough.
 */
export function groupHits(hits: StudyHit[], files: StudyFile[], limit = 12): FileHits[] {
  const byKey = new Map<string, StudyFile>();
  for (const f of files) if (!byKey.has(f.key)) byKey.set(f.key, f);
  const groups = new Map<string, FileHits>();
  for (const h of [...hits].sort((a, b) => b.similarity - a.similarity)) {
    const file = byKey.get(h.file_key);
    if (!file) continue;
    const g = groups.get(h.file_key) ?? { file, hits: [] };
    g.hits.push(h);
    groups.set(h.file_key, g);
  }
  return [...groups.values()].slice(0, limit);
}

/**
 * A passage cut to the part worth reading, with the query's words
 * marked: `[{ text, hit }]`. Matching is on whole-ish words of three or
 * more letters, case-insensitive; the window centres on the first hit.
 */
export function highlight(content: string, query: string, width = 220): Array<{ text: string; hit: boolean }> {
  const words = [...new Set(query.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])];
  const flat = content.replace(/\s+/g, " ").trim();
  const lower = flat.toLowerCase();
  const first = words.map((w) => lower.indexOf(w)).filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, Math.min(first - Math.floor(width / 3), flat.length - width));
  let text = flat.slice(start, start + width);
  if (start > 0) text = `…${text}`;
  if (start + width < flat.length) text = `${text}…`;
  if (words.length === 0) return [{ text, hit: false }];
  const pattern = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return text
    .split(pattern)
    .filter((part) => part !== "")
    .map((part) => ({ text: part, hit: words.includes(part.toLowerCase()) }));
}

/**
 * A course's syllabus. Manifests synced before the tagger read top-level
 * folders tag the files in Syllabi/ as "other", so the folder is checked
 * too.
 */
export function isSyllabusFile(f: StudyFile): boolean {
  return f.kind === "syllabus" || /^syllabi\//i.test(f.path);
}

/** How far back "New & updated" looks. */
export const RECENT_DAYS = 14;

/** Files new or changed on the Mac in the last fortnight, newest first: what the weekly scan, WhatsApp saves and your uploads just brought in. */
export function recentFiles(files: StudyFile[], now: number, limit = 6): StudyFile[] {
  const since = now - RECENT_DAYS * 86_400_000;
  return files
    .filter((f) => f.mtime >= since && f.mtime <= now + 86_400_000 && f.kind !== "pyq" && !isSyllabusFile(f))
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, limit);
}
