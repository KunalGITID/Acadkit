/** Syllabus units, joined to everything else the sync knows. */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { embedTexts } from "./embed.mjs";
import { cleanTopics, parseSyllabusText } from "./syllabus.mjs";
import { extractText } from "./text.mjs";

const CACHE = path.join(homedir(), "Library", "Caches", "AcadKit", "unit-vectors.json");
/** Same floor as topic links: a weak match is worse than none. */
const MIN_SIMILARITY = 0.8;
const LINK_TIER = { notes: 0, guide: 0, lab: 0, assignment: 0, whatsapp: 1, other: 1 };
const sha = (t) => createHash("sha256").update(t).digest("hex").slice(0, 24);

/** What a unit is about, for embedding: course, unit title, then its topics (capped). */
export function unitText(course, unit) {
  return `${course.title}. Unit ${unit.n}: ${unit.title}. ${unit.topics.join(", ")}`.slice(0, 1200);
}

/** One syllabus topic, for embedding: the course gives it context ("Trees" in DSA, not botany). */
export function topicText(course, topic) {
  return `${course.title}: ${topic}`;
}

/** A unit's topics, trimmed and de-duplicated, in syllabus order (the order matters: topics.mjs reads "Push" as belonging to the "Operations on Stack ADT" before it). */
export function syllabusTopics(topics) {
  const seen = new Set();
  const out = [];
  for (const raw of topics ?? []) {
    const t = String(raw).replace(/\s+/g, " ").replace(/[\s.;,:–-]+$/, "").trim();
    const k = t.toLowerCase();
    if (t.length < 2 || t.length > 400 || !/[a-z]{2}/i.test(t) || seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

function loadCache() {
  try {
    return existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : {};
  } catch {
    return {};
  }
}

/**
 * Build units.json.
 *
 *   courses      acadkit_syllabi.json's `courses`
 *   files        the sync's file list (tagged)
 */
/** PDFs that might be a course's syllabus, likeliest first: the file acadkit_syllabi.json names, then syllabus-kind PDFs with the code in the file name, then any with the code in the path. */
export function syllabusCandidates(course, files) {
  const code = course.code.toUpperCase();
  const pdfs = files.filter((f) => f.ext === "pdf");
  const named = pdfs.filter((f) => f.path.split("/").pop().toUpperCase().includes(code));
  const ordered = [
    ...(course.file ? pdfs.filter((f) => f.path === course.file) : []),
    ...named.filter((f) => f.kind === "syllabus"),
    ...named,
    ...pdfs.filter((f) => f.kind === "syllabus" && f.path.toUpperCase().includes(code)),
  ];
  return [...new Set(ordered)];
}

/** Each course's units, read from its own syllabus PDF where the folder has one (`parseSyllabusText`), since acadkit_syllabi.json ran the Learning Resources into the last unit and cut topics into fragments. */
export async function withPdfUnits(courses, files, { read = extractText, log = console.log } = {}) {
  const out = {};
  let fromPdf = 0;
  const missed = [];
  for (const [code, c] of Object.entries(courses)) {
    let units = null;
    for (const f of syllabusCandidates(c, files)) {
      try {
        const { pages } = await read(f.full, f.ext, f.key.slice(f.key.lastIndexOf("/") + 1).split(".")[0]);
        const text = pages.join("\n");
        // Only the course's own syllabus: a lesson plan names the course too.
        if (!new RegExp(`Course\\s*Code\\s*${c.code}`, "i").test(text)) continue;
        const parsed = parseSyllabusText(text, c.code);
        if (parsed.length >= Math.max(1, (c.units ?? []).length)) {
          units = parsed;
          break;
        }
      } catch (err) {
        log(`  Units · ${c.code}: couldn't read ${f.path} (${err.message})`);
      }
    }
    if (units) fromPdf++;
    else if ((c.units ?? []).length) missed.push(c.code);
    out[code] = {
      ...c,
      units: units ?? (c.units ?? []).map((u) => ({ ...u, topics: cleanTopics(u.topics) })),
    };
  }
  log(`  Units: ${fromPdf} of ${Object.keys(courses).length} courses read from their syllabus PDF.`);
  // Named, so a course still on acadkit_syllabi.json's topics is visible.
  if (missed.length) log(`  Units: no readable syllabus PDF for ${missed.join(", ")} — their topics are acadkit_syllabi.json's, cleaned.`);
  return out;
}

export async function buildUnits({ courses: given, files, supabase, pin, url, key, log = console.log }) {
  const cache = loadCache();
  const courses = await withPdfUnits(given, files, { log });
  const all = Object.values(courses);
  const hasFiles = new Set(files.map((f) => f.subject_code).filter(Boolean));
  const texts = all.flatMap((c) => c.units.map((u) => unitText(c, u)));
  // Each syllabus topic on its own, for the courses with files (and so
  // possibly past papers): topics.mjs names past-paper topics after them.
  const topicTexts = all
    .filter((c) => hasFiles.has(c.code))
    .flatMap((c) => c.units.flatMap((u) => syllabusTopics(u.topics).map((t) => topicText(c, t))));
  const missing = [...new Set([...texts, ...topicTexts].filter((t) => !cache[sha(t)]))];
  if (missing.length) {
    log(`  Units: embedding ${missing.length} syllabus units and topics…`);
    const vectors = await embedTexts(missing, { url, key });
    missing.forEach((t, i) => (cache[sha(t)] = vectors[i]));
    mkdirSync(path.dirname(CACHE), { recursive: true });
    writeFileSync(CACHE, JSON.stringify(cache));
  }

  const fileByKey = new Map(files.map((f) => [f.key, f]));
  const unitVectors = new Map();
  const syllabi = new Map();
  const out = {};

  for (const c of all) {
    const vecs = [];
    const units = [];
    const topics = [];
    for (const u of c.units) {
      const vector = cache[sha(unitText(c, u))];
      vecs.push({ n: u.n, vector });
      if (hasFiles.has(c.code)) {
        for (const t of syllabusTopics(u.topics))
          topics.push({ n: u.n, unitTitle: u.title ?? "", topic: t, vector: cache[sha(topicText(c, t))] ?? null });
      }
      let refs = [];
      let matched = 0;
      if (hasFiles.has(c.code) && vector) {
        const { data, error } = await supabase.rpc("match_study_chunks", { p_device: pin, query_embedding: vector, match_count: 50 });
        if (error) throw new Error(error.message);
        const best = new Map();
        for (const hit of data ?? []) {
          if (hit.similarity < MIN_SIMILARITY) break;
          const f = fileByKey.get(hit.file_key);
          if (!f || f.subject_code !== c.code || !(f.kind in LINK_TIER) || best.has(f.path)) continue;
          // Another unit's notes never stand in for this one's: a unit with none of
          // its own should read as a gap, not borrow Unit 1's slides.
          if (f.unit != null && f.unit !== u.n) continue;
          // A file tagged with this unit beats an untagged one.
          const unitRank = f.unit === u.n ? 0 : 1;
          best.set(f.path, { path: f.path, page: hit.page ?? null, tier: LINK_TIER[f.kind], unitRank });
        }
        matched = best.size;
        // Stable sorts: within a rank, still closest first.
        refs = [...best.values()]
          .sort((a, b) => a.unitRank - b.unitRank || a.tier - b.tier)
          .slice(0, 3)
          .map(({ path: p, page }) => ({ path: p, page }));
      }
      units.push({ n: u.n, title: u.title, hours: u.hours ?? null, topics: u.topics, refs, files: matched });
    }
    unitVectors.set(c.code, vecs.filter((v) => v.vector));
    if (topics.length) syllabi.set(c.code, { title: c.title, topics });
    out[c.code] = {
      code: c.code,
      title: c.title,
      semester: c.semester,
      credits: c.credits,
      prerequisites: c.prerequisites ?? null,
      file: c.file ?? null,
      hasFiles: hasFiles.has(c.code),
      units,
    };
  }
  log(`  Units: ${all.length} courses, ${texts.length} units, ${topicTexts.length} topics.`);
  return { units: { version: 1, generatedAt: Date.now(), courses: out }, unitVectors, syllabi };
}
