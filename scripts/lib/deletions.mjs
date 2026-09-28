/**
 * Pure helpers for scripts/apply-study-deletions.mjs, kept apart so they
 * can be tested without a Mac, a bucket or a Trash.
 */
import path from "node:path";

/** Where a requested path lives on disk, or why it may not be touched. */
export function resolveRequest(root, rel) {
  if (typeof rel !== "string" || rel === "" || rel.includes("\0")) return { error: "not a file path" };
  if (rel.startsWith("/") || rel.includes("\\")) return { error: "not a path inside the study folder" };
  const parts = rel.split("/");
  if (parts.some((p) => p === "" || p === "." || p === ".."))
    return { error: "not a path inside the study folder" };
  if (parts.some((p) => p.startsWith(".") || p.startsWith("_") || p.startsWith("~$")))
    return { error: "the sync never uploads this path" };
  const full = path.resolve(root, ...parts);
  if (!full.startsWith(path.resolve(root) + path.sep)) return { error: "not a path inside the study folder" };
  return { full };
}

/** The content hash inside a storage key: "<pin>/blobs/<sha256>.<ext>" → sha256. */
export function shaOfKey(key) {
  const m = /\/blobs\/([0-9a-f]{64})(\.[^/]*)?$/.exec(String(key));
  return m ? m[1] : null;
}

/**
 * A name that isn't taken: `base` itself, else with `pattern` ("%d" is the
 * counter) before the extension: "a.pdf", "a (2).pdf", "a (3).pdf", ….
 */
export function freeName(base, taken, pattern = " (%d)") {
  if (!taken(base)) return base;
  const ext = path.extname(base);
  const stem = base.slice(0, base.length - ext.length);
  for (let n = 2; ; n++) {
    const name = `${stem}${pattern.replace("%d", String(n))}${ext}`;
    if (!taken(name)) return name;
  }
}

/** A name in the Trash that isn't taken: "a.pdf", then "a (AcadKit 2).pdf", …. */
export function trashName(base, taken) {
  return freeName(base, taken, " (AcadKit %d)");
}

/**
 * The _src markdown a PDF was built from (the folder's md2pdf convention),
 * so deleting the PDF doesn't bring it back at the next rebuild.
 */
export function sourceOf(rel) {
  return rel.toLowerCase().endsWith(".pdf") ? `_src/${rel.slice(0, -4)}.md` : null;
}

/** Its web version (md2pdf.py's build_html), which the app shows in its place. */
export function webVersionOf(rel) {
  return rel.toLowerCase().endsWith(".pdf") ? `_src/_html/${rel.slice(0, -4)}.html` : null;
}

/** Exam prep (`_src/acadkit_prep.json`) without links to `gone` paths. */
export function dropFromPrep(prep, gone) {
  let removed = 0;
  const tests = (prep?.tests ?? []).map((t) => {
    const files = (t.files ?? []).filter((f) => !gone.has(f.path));
    removed += (t.files?.length ?? 0) - files.length;
    return files.length === (t.files?.length ?? 0) ? t : { ...t, files };
  });
  return { prep: removed ? { ...prep, tests } : prep, removed };
}
