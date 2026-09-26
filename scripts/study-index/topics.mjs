/**
 * Past-paper topic mining.
 *
 * Every subject folder keeps its past papers under 07_PYQs/<test>/ —
 * End_Sem, FJ-I, FT-II and so on. This reads them (OCR included, via
 * text.mjs), splits them into questions, embeds each question with the
 * same model as search, and groups questions that ask the same thing.
 * A topic's weight is how many *different papers* asked it: the same
 * question twice in one paper is one paper.
 *
 * What it produces is a frequency, not a prediction. "Asked in 5 of 7
 * papers" is a fact about the past; the app says it that way.
 *
 * Pure functions (paper grouping, question splitting, clustering,
 * labelling) are exported for tests; mineTopics does the I/O.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { embedTexts } from "./embed.mjs";
import { extractText, extractable } from "./text.mjs";

/** Cosine similarity above which two questions are the same topic (gte-small). */
export const SAME_TOPIC = 0.87;
// Tuned on real OS and DSA papers: 0.84 merged whole units ("tree", 65
// questions), 0.86 still lumped every queue question together, and 0.88
// began splitting one idea (deadlock) across clusters. gte-small scores
// unrelated questions from one subject around 0.78, so the band is narrow.
/** A topic asked in only one paper isn't "most asked" of anything. */
const MIN_PAPERS = 2;
const TOPICS_PER_SUBJECT = 12;
const VECTOR_CACHE = path.join(homedir(), "Library", "Caches", "AcadKit", "question-vectors.json");

const CODE = /_(\d{2}[A-Z]{3}\d{3}[A-Z])$/;
/** Folders under 07_PYQs that hold something other than papers. */
const NOT_PAPERS = /important|topics|syllabus|notes|solutions?_guide/i;

// ---------- which files are papers ----------

/**
 * One paper's identity. Photos of one paper share a stem —
 * "2024_FJ-III_SetC_photo_20241106-WA0034.jpg" and "…-WA0035.jpg" are
 * pages of the same paper — so the page suffix is dropped.
 */
export function paperId(filePath) {
  const dir = path.posix.dirname(filePath);
  const stem = path.posix
    .basename(filePath)
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/_photo.*$/i, "")
    .replace(/[-_ ](wa)?\d{3,}$/i, "");
  return `${dir}/${stem}`;
}

/** Year a paper was set, read off its path: 2023, May_2025, … */
export function paperYear(filePath) {
  const years = String(filePath).match(/(?:19|20)\d{2}/g);
  return years ? Math.max(...years.map(Number)) : null;
}

/**
 * Past papers, by subject: `[{ subjectCode, papers: [{ id, group, year, files }] }]`.
 * A file is a paper if it sits under a folder called *PYQ* inside a
 * subject folder whose name ends in its course code.
 */
export function pastPapers(files) {
  const subjects = new Map();
  for (const f of files) {
    const parts = f.path.split("/");
    const code = parts[0].match(CODE)?.[1];
    const at = parts.findIndex((p) => /pyq/i.test(p));
    if (!code || at !== 1 || !extractable(f.ext)) continue;
    const group = parts.length > at + 2 ? parts[at + 1] : "General";
    if (NOT_PAPERS.test(group)) continue;
    const id = paperId(f.path);
    const subject = subjects.get(code) ?? new Map();
    const paper = subject.get(id) ?? { id, group, year: paperYear(f.path), files: [] };
    paper.files.push(f);
    subject.set(id, paper);
    subjects.set(code, subject);
  }
  return [...subjects].map(([subjectCode, papers]) => ({ subjectCode, papers: [...papers.values()] }));
}

// ---------- questions out of a paper ----------

/** Lines that are furniture, not questions: marks columns, headers, footers. */
const NOISE = [
  /^[\d\s.,/()-]*$/, // bare numbers: marks, COs, page counts
  /^(page|reg\.?\s*no|register|time|max(imum)?\.?\s*marks?|duration|course code|course name|course title|part\s*[-–]?\s*[a-c]\b|instructions?|note\s*:)/i,
  /^(co|bl|pi|l)\s*\d/i, // CO1, BL2 columns
  /^answer (all|any)\b/i,
  /^\d{2}[a-z]{2,4}\d{3}[a-z]?\b/i, // a course code heading a line: "21CSC201J – Data Structures…"
  // Every paper's letterhead: taken for a question, it became the most
  // "repeated topic" of all, asked in every paper.
  /srm institute|institute of science|college of engineering|degree examination|candidates admitted|academic year|(odd|even) semester|b\.\s?tech/i,
  /kattankulathur|chengalpattu|srm nagar|invigilator|omr sheet|hall ticket/i, // address, exam-hall instructions
  // The newer letterhead: "School of Computing … Course Articulation Matrix … Year/Sem".
  /school of computing|articulation|programme? outcomes?|\bps?o\d{1,2}\b|year\s*[/&]\s*sem|\bsem\s*[:–-]|\bsrm\b|department of|faculty of/i,
  /\(\s*\d+\s*[x×*]\s*\d+\s*=\s*\d+\s*marks?\s*\)/i, // "(20 x 1 = 20 Marks)"
];

/**
 * Things only a paper's header says. OCR merges and misspells header
 * rows ("Academie Year", "PO PO PSO-1"), so no one line-rule catches
 * them all — but a real question almost never carries two of these, and
 * a header almost always carries several.
 */
// Not BL or CO1: those are also each question's own marks columns.
const HEADER_MARKERS = /test\s*:|date\s*:|course\s+outcome|programm?e?\s+specific|academi[ce]\s+year|q\.?\s*no\b|\bpso\b|\bpo\s+po\b|\bs\.\s?no\b|register\s+no|reg\.?\s*no|\(\s*\d+\s*x\s*\d+/gi;
// Judged on the opening only: a header starts its block, while a real
// question can have the next page's header run onto its end.
const isHeader = (q) => (q.slice(0, 160).match(HEADER_MARKERS) ?? []).length >= 2;

const QUESTION_START = /^(?:q\.?\s*)?(\d{1,2})\s*[.)]\s*(?:[a-e][.)]\s*)?(?=\S)/i;
const OR_LINE = /^\(?\s*or\s*\)?$/i;

/**
 * The questions on a paper. A new question starts at a numbered line
 * ("30. a. Describe…") and at every "(OR)"; lines in between belong to
 * the question above. Each comes back trimmed to its opening, since an
 * answer key's worked answer follows the question and is not the topic.
 * `keepHeaders` leaves header blocks in, for auditing what the filter drops.
 */
export function splitQuestions(text, { keepHeaders = false } = {}) {
  const lines = String(text ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l && !NOISE.some((re) => re.test(l)));
  const questions = [];
  let current = [];
  const flush = () => {
    const q = current
      .join(" ")
      .replace(QUESTION_START, "")
      .replace(/^[a-e][.)]\s+/i, "")
      .replace(/\s+/g, " ")
      .trim();
    if ((q.match(/[a-z]/gi) ?? []).length >= 20 && (keepHeaders || !isHeader(q))) questions.push(q.slice(0, 300));
    current = [];
  };
  for (const line of lines) {
    if (OR_LINE.test(line)) {
      flush();
      continue;
    }
    if (QUESTION_START.test(line) && current.length) flush();
    current.push(line);
  }
  flush();
  return questions;
}

// ---------- grouping questions that ask the same thing ----------

function cosine(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // vectors arrive normalised
}

/**
 * Average-linkage agglomerative clustering on cosine similarity: keep
 * merging the two most similar groups while their average similarity
 * is at least `threshold`. Returns groups of indices.
 */
export function clusterVectors(vectors, threshold = SAME_TOPIC) {
  const n = vectors.length;
  let clusters = vectors.map((_, i) => [i]);
  // Sum of pairwise similarities between clusters i and j.
  const sums = vectors.map((a, i) => vectors.map((b, j) => (i === j ? 0 : cosine(a, b))));
  for (;;) {
    let best = -Infinity;
    let bi = -1;
    let bj = -1;
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const avg = sums[i][j] / (clusters[i].length * clusters[j].length);
        if (avg > best) {
          best = avg;
          bi = i;
          bj = j;
        }
      }
    }
    if (bi < 0 || best < threshold) break;
    // Merge j into i: sums add, row and column j go.
    for (let k = 0; k < clusters.length; k++) {
      if (k === bi || k === bj) continue;
      sums[bi][k] += sums[bj][k];
      sums[k][bi] = sums[bi][k];
    }
    clusters[bi] = clusters[bi].concat(clusters[bj]);
    clusters.splice(bj, 1);
    sums.splice(bj, 1);
    for (const row of sums) row.splice(bj, 1);
  }
  return n === 0 ? [] : clusters;
}

// ---------- naming a topic ----------

const STOP = new Set(
  (
    "a an the and or of to in on for at by is are be with from this that these those it its as into " +
    "explain describe discuss write short note notes marks mark following given find detail details example examples " +
    "briefly brief suitable neat diagram diagrams what how why which when where state define list illustrate " +
    "compare differentiate between using use used consider calculate determine show prove derive give draw " +
    "answer question questions part any all each two three four five one also can will would should may"
  ).split(" ")
);

function terms(text) {
  const words = text
    .toLowerCase()
    .replace(/[’']s\b/g, "s")
    .split(/[^a-z0-9+#]+/)
    // Plain words only (c++ and c# excepted): numbers, codes ("15cs302j",
    // OCR's "12da1") and algebra ("y+x") name nothing.
    .filter((w) => (/^[a-z]{3,}$/.test(w) || /^[a-z](\+\+|#)$/.test(w)) && !STOP.has(w));
  const bigrams = words.slice(1).map((w, i) => `${words[i]} ${w}`);
  return [...words, ...bigrams];
}

/**
 * A few words that set each cluster apart from the rest of the
 * subject's clusters (class-based TF-IDF). A bigram that scores well
 * drops the single words it contains, so "page replacement" isn't
 * followed by "page" and "replacement".
 */
export function labelClusters(clusterTexts, perLabel = 3) {
  const counts = clusterTexts.map((texts) => {
    const tf = new Map();
    for (const t of texts) for (const w of new Set(terms(t))) tf.set(w, (tf.get(w) ?? 0) + 1);
    return tf;
  });
  const df = new Map();
  for (const tf of counts) for (const w of tf.keys()) df.set(w, (df.get(w) ?? 0) + 1);
  const k = clusterTexts.length;
  return counts.map((tf, i) => {
    const scored = [...tf]
      .map(([w, c]) => ({ w, s: (c / clusterTexts[i].length) * Math.log(1 + k / (df.get(w) ?? 1)) * (w.includes(" ") ? 1.4 : 1) }))
      .sort((a, b) => b.s - a.s);
    const picked = [];
    for (const { w } of scored) {
      if (picked.length >= perLabel) break;
      if (picked.some((p) => p.includes(w) || w.includes(p))) continue;
      picked.push(w);
    }
    return picked.join(" · ");
  });
}

// ---------- the whole pass ----------

function loadVectorCache() {
  try {
    return existsSync(VECTOR_CACHE) ? JSON.parse(readFileSync(VECTOR_CACHE, "utf8")) : {};
  } catch {
    return {};
  }
}

const sha = (text) => createHash("sha256").update(text).digest("hex").slice(0, 24);

/**
 * Mine every subject's past papers and return the topics document the
 * app reads as <pin>/topics.json. Question vectors are cached on disk by
 * text, so a re-run only embeds new questions.
 */
export async function mineTopics({ files, url, key, log = console.log }) {
  const subjects = pastPapers(files);
  if (subjects.length === 0) {
    log("Topics: no past papers found (looking for <subject>_<CODE>/07_PYQs/…).");
    return null;
  }
  const cache = loadVectorCache();
  const out = [];
  for (const { subjectCode, papers } of subjects) {
    const questions = [];
    for (const paper of papers) {
      for (const f of paper.files) {
        const { pages } = await extractText(f.full, f.ext, f.key.slice(f.key.lastIndexOf("/") + 1).split(".")[0]);
        for (const q of splitQuestions(pages.join("\n"))) questions.push({ text: q, paper });
      }
    }
    if (questions.length < 2) continue;

    const missing = [...new Set(questions.map((q) => q.text).filter((t) => !cache[sha(t)]))];
    if (missing.length) {
      const vectors = await embedTexts(missing, { url, key });
      missing.forEach((t, i) => (cache[sha(t)] = vectors[i]));
    }
    const vectors = questions.map((q) => cache[sha(q.text)]);
    const clusters = clusterVectors(vectors);
    const labels = labelClusters(clusters.map((c) => c.map((i) => questions[i].text)));

    const topics = clusters
      .map((members, ci) => {
        const papersHere = new Map(members.map((i) => [questions[i].paper.id, questions[i].paper]));
        const groups = {};
        for (const p of papersHere.values()) groups[p.group] = (groups[p.group] ?? 0) + 1;
        const years = [...papersHere.values()].map((p) => p.year).filter(Boolean);
        // The most typical question: highest average similarity to the rest.
        const medoid = members
          .map((i) => ({ i, s: members.reduce((a, j) => a + cosine(vectors[i], vectors[j]), 0) }))
          .sort((a, b) => b.s - a.s)[0].i;
        return {
          label: labels[ci] || questions[medoid].text.slice(0, 60),
          example: questions[medoid].text.slice(0, 160),
          papers: papersHere.size,
          questions: members.length,
          latest: years.length ? Math.max(...years) : null,
          groups,
        };
      })
      .filter((t) => t.papers >= MIN_PAPERS)
      .sort((a, b) => b.papers - a.papers || (b.latest ?? 0) - (a.latest ?? 0) || b.questions - a.questions)
      .slice(0, TOPICS_PER_SUBJECT);

    const groups = {};
    for (const p of papers) groups[p.group] = (groups[p.group] ?? 0) + 1;
    out.push({ subject_code: subjectCode, papers: papers.length, questions: questions.length, groups, topics });
    log(`  Topics · ${subjectCode}: ${papers.length} papers, ${questions.length} questions → ${topics.length} repeated topics`);
  }

  mkdirSync(path.dirname(VECTOR_CACHE), { recursive: true });
  writeFileSync(VECTOR_CACHE, JSON.stringify(cache));
  return { version: 1, generatedAt: Date.now(), model: "gte-small", subjects: out };
}
