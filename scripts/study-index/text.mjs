/**
 * Text out of the study folder, cached by content hash.
 *
 * PDFs (with OCR for scanned pages), photos and Word files go through
 * extract-text.swift, which uses only what macOS ships with; PowerPoint
 * decks are unzipped (the `unzip` every Mac has) and their slide XML
 * read; plain text and code are read as-is. Nothing here installs a
 * package or sends a file anywhere.
 *
 * Results are cached in ~/Library/Caches/AcadKit/text/<sha>.json, keyed by
 * the file's content hash and the extractor's version, so an unchanged
 * file is read once — OCR included — however often the sync runs.
 */
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const SWIFT_SOURCE = path.join(here, "extract-text.swift");
const CACHE = path.join(homedir(), "Library", "Caches", "AcadKit");
/** Bump when extraction changes, so cached text is read again. */
export const EXTRACT_VERSION = 1;

const NATIVE = new Set(["pdf", "jpg", "jpeg", "png", "heic", "tif", "tiff", "docx", "doc", "rtf"]);
const PLAIN = new Set(["txt", "md", "c", "h", "cpp", "java", "py", "js", "ts", "sql", "csv", "html", "htm", "ipynb"]);

/** Whether this file's text can be read at all. */
export function extractable(ext) {
  return NATIVE.has(ext) || PLAIN.has(ext) || ext === "pptx";
}

let extractorPath = null;

/**
 * The compiled extractor, built on first use. The binary is named after
 * the source's hash, so editing extract-text.swift rebuilds it.
 */
async function extractor() {
  if (extractorPath) return extractorPath;
  const source = readFileSync(SWIFT_SOURCE);
  const tag = createHash("sha256").update(source).digest("hex").slice(0, 12);
  const bin = path.join(CACHE, `extract-text-${tag}`);
  if (!existsSync(bin)) {
    mkdirSync(CACHE, { recursive: true });
    console.log("  Building the text extractor (once; about a minute)…");
    try {
      await run("swiftc", ["-O", SWIFT_SOURCE, "-o", bin], { maxBuffer: 16 << 20 });
    } catch (err) {
      throw new Error(
        `Couldn't build the text extractor: ${err.stderr || err.message}\n` +
          "It needs the Xcode Command Line Tools: xcode-select --install"
      );
    }
  }
  extractorPath = bin;
  return bin;
}

const decode = (s) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&");

/** A deck's slides in order, each as its text runs joined up. */
async function pptxSlides(full) {
  const { stdout: list } = await run("unzip", ["-Z1", full], { maxBuffer: 16 << 20 });
  const slides = list
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^ppt\/slides\/slide\d+\.xml$/.test(l))
    .sort((a, b) => Number(a.match(/(\d+)\.xml$/)[1]) - Number(b.match(/(\d+)\.xml$/)[1]));
  const pages = [];
  for (const entry of slides) {
    const { stdout: xml } = await run("unzip", ["-p", full, entry], { maxBuffer: 64 << 20 });
    // Paragraphs become lines; the text itself lives in <a:t> runs.
    const text = xml
      .split(/<\/a:p>/)
      .map((para) => [...para.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => decode(m[1])).join(""))
      .filter((line) => line.trim())
      .join("\n");
    pages.push(text);
  }
  return pages;
}

async function plainText(full, ext) {
  const raw = await readFile(full, "utf8");
  if (ext === "html" || ext === "htm") {
    return [decode(raw.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "))];
  }
  if (ext === "ipynb") {
    try {
      const nb = JSON.parse(raw);
      return (nb.cells ?? []).map((c) => (Array.isArray(c.source) ? c.source.join("") : String(c.source ?? "")));
    } catch {
      return [];
    }
  }
  return [raw];
}

/**
 * `{ pages: string[], ocr: boolean[] }` for a file, from cache when its
 * content hasn't changed. Pages are PDF pages or slides; other formats
 * are one page.
 */
export async function extractText(full, ext, sha) {
  const cacheFile = path.join(CACHE, "text", `${sha}.json`);
  if (existsSync(cacheFile)) {
    try {
      const cached = JSON.parse(readFileSync(cacheFile, "utf8"));
      if (cached.v === EXTRACT_VERSION) return cached;
    } catch {
      // A corrupt cache entry is just re-read.
    }
  }

  let result = { pages: [], ocr: [] };
  if (NATIVE.has(ext)) {
    const { stdout } = await run(await extractor(), [full], { maxBuffer: 256 << 20 });
    result = JSON.parse(stdout || '{"pages":[],"ocr":[]}');
  } else if (ext === "pptx") {
    const pages = await pptxSlides(full);
    result = { pages, ocr: pages.map(() => false) };
  } else if (PLAIN.has(ext)) {
    const pages = await plainText(full, ext);
    result = { pages, ocr: pages.map(() => false) };
  }

  mkdirSync(path.dirname(cacheFile), { recursive: true });
  writeFileSync(cacheFile, JSON.stringify({ v: EXTRACT_VERSION, ...result }));
  return { v: EXTRACT_VERSION, ...result };
}
