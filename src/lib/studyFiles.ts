/**
 * The study-folder tree, as written by scripts/sync-study-folder.mjs.
 *
 * The folder is stored flat — one manifest listing every file by its
 * path, blobs named by content hash — so everything folder-shaped the
 * Files page shows is derived here, from paths alone.
 */

export interface StudyFile {
  /** Path inside the synced folder, "/"-separated, e.g. "OS_21CSC202J/02_Notes/Unit1.pdf". */
  path: string;
  size: number;
  /** Last-modified time on the Mac, epoch ms. */
  mtime: number;
  /** Storage object key: "<device_id>/blobs/<sha256>.<ext>". */
  key: string;
}

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

/**
 * Files whose path matches every word of the query, in any order and any
 * case — so "os unit 1" finds "OS_21CSC202J/02_Notes/Unit1_OS.pptx".
 *
 * Paths and queries are both cut into tokens at separators and at every
 * letter/digit boundary ("Unit1_OS" → unit, 1, os). A word matches the
 * start of a token, but a number has to match a whole number: "unit 1"
 * must not find Unit10, and "1" must not find every "21CSC…" code.
 */
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

/** Types Safari and Chrome open in a tab. Everything else is downloaded. */
const VIEWABLE = new Set(["pdf", "png", "jpg", "jpeg", "gif", "webp", "txt", "md", "csv", "c", "py", "java", "html"]);

export function opensInBrowser(path: string): boolean {
  return VIEWABLE.has(extOf(path));
}
