/** Past-paper topic mining. */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { embedTexts } from "./embed.mjs";
import { extractText, extractable } from "./text.mjs";

/** Cosine similarity above which two questions are the same topic (gte-small). */
export const SAME_TOPIC = 0.87;
// Tuned on real OS and DSA papers: 0.84 merged whole units ("tree", 65 questions), 0.86 still lumped every queue question together, and 0.88 began splitting one idea (deadlock) across clusters.
/** A topic asked in only one paper isn't "most asked" of anything. */
const MIN_PAPERS = 2;
// Exam prep and a subject page show the first few; the practice page all of them.
const TOPICS_PER_SUBJECT = 40;
/** Real questions kept per topic for practice: one per paper, newest first. */
const ASKED_PER_TOPIC = 6;
const VECTOR_CACHE = path.join(homedir(), "Library", "Caches", "AcadKit", "question-vectors.json");

const CODE = /_(\d{2}[A-Z]{3}\d{3}[A-Z])$/;
/** Folders under 07_PYQs that hold something other than papers. */
const NOT_PAPERS = /important|topics|syllabus|notes|solutions?_guide/i;

// ---------- which files are papers ----------

/**
 * One paper's identity. Photos of one paper share a stem -
 * "2024_FJ-III_SetC_photo_20241106-WA0034.jpg" and "…-WA0035.jpg" are
 * pages of the same paper - so the page suffix is dropped.
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

/** Past papers, by subject: `[{ subjectCode, papers: [{ id, group, year, files }] }]`. */
export function pastPapers(files) {
  const subjects = new Map();
  for (const f of files) {
    const parts = f.path.split("/");
    const code = f.subject_code ?? parts[0].match(CODE)?.[1];
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

/**
 * A question from an answer key carries its answer ("… Answer: A B + C D - *").
 * Practising, you want the question alone and the answer on request.
 */
export function splitAnswer(text) {
  const m = /\s(?:Ans(?:wer)?)\s*[:.\-–]\s*/i.exec(text);
  if (!m || m.index < 15) return { text: text.slice(0, 500) };
  const answer = text.slice(m.index + m[0].length).trim();
  return { text: text.slice(0, m.index).trim().slice(0, 500), ...(answer ? { answer: answer.slice(0, 500) } : {}) };
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
  // Instructions to candidates, and the semester line: "Third & Fourth Semester".
  /answer\s*booklet|should be answered|to be answered|handed over|question paper|within first \d+ minutes/i,
  /^(first|second|third|fourth|fifth|sixth|seventh|eighth|[ivx]+)\b[\s&,]*(\w+\s*)?semester\b/i,
  /^(test|date|duration|set|course code|year)\s*[:&-]/i,
];

/** Page footers like "29MF3&4-21CSC202J", and the "Marks BL CO" column heads run into a question. */
const INLINE_NOISE = [/\b\d{1,2}[A-Z]{2}\d(?:&\d)?-\d{2}[A-Z]{3}\d{3}[A-Z]\b/g, /\bmarks\s+bl\s+c\s?o\b/gi, /\bbl\s+c\s?o\b/gi];

/** An MCQ's stem without its options: "(A) Interrupt (B) Message …" names four answers, three of them wrong, and was the main source of nonsense in topic names. */
function stripOptions(q) {
  const at = q.search(/(?:^|\s)\(?\s*[AА]\s*\)\s*\S/);
  if (at < 0 || !/\(?\s*[BВ]\s*\)/.test(q.slice(at + 3))) return q;
  return q.slice(0, at).trim();
}

/**
 * "(a) … (b) …" and "(i) … (ii) …" are separate questions on one line.
 * Case matters: (B) is an MCQ option, (b) a part.
 */
const SUB_PART = /\s+\(\s*(?:[b-e]|ii|iii|iv|v)\s*\)\s+(?=\S)|(?<=[.?])\s+\(\s*a\s*\)\s+(?=\S)/;

/**
 * Words that open a question. A photo of a paper often loses its
 * question numbers to OCR (they sit in a column of their own), so a paper
 * that yields almost nothing numbered is split at these instead.
 */
const VERB_START =
  /^(explain|describe|discuss|write|implement|develop|design|create|construct|compare|differentiate|distinguish|define|what|how|why|illustrate|find|solve|prove|derive|consider|given|analy[sz]e|identify|list|state|evaluate|calculate|compute|apply|demonstrate|build|suppose|assume|draw|obtain|determine|justify|outline|elaborate|summari[sz]e|classify|convert|trace|show|an?\s+\w+)\b/i;

/** Things only a paper's header says. */
// Not BL or CO1: those are also each question's own marks columns.
const HEADER_MARKERS = /test\s*:|date\s*:|course\s+outcome|programm?e?\s+specific|academi[ce]\s+year|q\.?\s*no\b|\bpso\b|\bpo\s+po\b|\bs\.\s?no\b|register\s+no|reg\.?\s*no|\(\s*\d+\s*x\s*\d+/gi;
// Judged on the opening only: a header starts its block, while a real
// question can have the next page's header run onto its end.
const isHeader = (q) => (q.slice(0, 160).match(HEADER_MARKERS) ?? []).length >= 2;

const QUESTION_START = /^(?:q\.?\s*)?(\d{1,2})\s*[.)]\s*(?:[a-e][.)]\s*)?(?=\S)/i;
const OR_LINE = /^\(?\s*or\s*\)?$/i;

/** The questions on a paper. */
export function splitQuestions(text, { keepHeaders = false } = {}) {
  const lines = String(text ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l && !NOISE.some((re) => re.test(l)));
  const pass = (byVerb) => {
    const questions = [];
    let current = [];
    const flush = () => {
      let block = current.join(" ");
      for (const re of INLINE_NOISE) block = block.replace(re, " ");
      block = block.replace(/\s+/g, " ").trim();
      // A header run into the first question is dropped as a whole, as before.
      if (!keepHeaders && isHeader(block)) {
        current = [];
        return;
      }
      for (const part of block.split(SUB_PART)) {
        const q = stripOptions(
          part
            .replace(QUESTION_START, "")
            .replace(/^\(?\s*(?:[a-e]|i{1,3}|iv)\s*[.)]\s+/i, "")
            .trim()
        );
        if ((q.match(/[a-z]/gi) ?? []).length >= 20) questions.push(q.slice(0, 300));
      }
      current = [];
    };
    for (const line of lines) {
      if (OR_LINE.test(line)) {
        flush();
        continue;
      }
      // By opening word only where the line before finished a sentence:
      // "…a lottery number and / determine the prize…" is one question.
      // A header's last line ("Question", "Marks") ends no sentence either.
      const verbStart =
        byVerb &&
        VERB_START.test(line) &&
        (/[.?!:)]\s*$/.test(current[current.length - 1] ?? "") || isHeader(current.join(" ")));
      if ((QUESTION_START.test(line) || verbStart) && current.length) flush();
      current.push(line);
    }
    flush();
    return questions;
  };
  const numbered = pass(false);
  // Few numbered questions from a lot of text means the numbers were lost.
  if (numbered.length < 3 && lines.length > 6) {
    const byVerb = pass(true);
    if (byVerb.length > numbered.length) return byVerb;
  }
  return numbered;
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

/** A few words that set each cluster apart from the rest of the subject's clusters (class-based TF-IDF). */
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

// ---------- matching questions to the syllabus by their words ----------

/** A light stemmer: plurals and -ing, so "semaphores" meets "Semaphore" and "scheduling" meets "schedule". */
function stem(w) {
  if (w.length > 4 && w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && /(sses|xes|ches|shes)$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !/(ss|us|is)$/.test(w)) w = w.slice(0, -1);
  if (w.length > 6 && w.endsWith("ing")) w = w.slice(0, -3);
  if (w.length > 5 && w.endsWith("ed")) w = w.slice(0, -2);
  if (w.length > 4 && w.endsWith("e")) w = w.slice(0, -1);
  return w;
}

/** Words that say what is being asked about, stemmed. Two-letter acronyms and numbers name nothing. */
// "List" and "state" ask a question ("List the…", "State the…") but are
// also what DSA and PDEs are about: linked lists, steady state.
const MATCH_STOP = new Set([
  ...[...STOP].filter((w) => !["list", "state", "part", "two", "one"].includes(w)),
  ..."introduction basic basics concept concepts overview type types various different important need".split(" "),
]);
function words(text) {
  return String(text)
    .toLowerCase()
    .replace(/[’']s\b/g, "")
    .split(/[^a-z0-9+#]+/)
    .filter((w) => (/^[a-z]{3,}$/.test(w) || /^[a-z](\+\+|#)$/.test(w)) && !MATCH_STOP.has(w))
    .map(stem);
}

/** Headings that say nothing without their unit: "Types – Singly, Doubly, Circular". */
const VAGUE_HEADING = /^(types?|operations?|applications?|implementations?|introduction|definition|basics?|properties|features|methods?|techniques?)$/i;

/** "Operations on Stack ADT – Create, Push" and "Deadlocks: System Model": heading, then item. */
function headed(text) {
  const m = /^(.{3,60}?)\s*(?:\s[–—-]\s*|[–—]\s*|:\s+)(.+)$/.exec(text);
  if (!m || m[1].split(/\s+/).length > 6) return { heading: null, item: text };
  return { heading: m[1].trim(), item: m[2].trim() };
}

/** One word, at most two: "Push", "Singly", "Heaps", "Trade off". */
const isShort = (text) => words(text).length <= 1 && text.trim().split(/\s+/).length <= 2;

/**
 * Items that only mean something under their heading, whatever the list
 * looks like: operations, kinds, measures. A short item that is a real
 * term ("Heaps", "Semaphores", "Recursion") stands on its own.
 */
const GENERIC_ITEM = new Set(
  (
    "create insert insertion search searching delete deletion display traverse traversal update push pop top peek enqueue dequeue " +
    "singly doubly circular linear time space trade off definition type adt operation array linked cursor based static dynamic " +
    "advantage disadvantage merit demerit limitation example property feature use uses normal uniform binomial exponential poisson " +
    "join split sort merge copy count find replace"
  )
    .split(" ")
    .map(stem)
);

/** Names that add nothing after their heading: "Virtual Memory - Introduction". */
const EMPTY_NAME = /^(introduction|basics?|basic concepts?|overview|definition|fundamentals|concepts?|applications?|properties)$/i;

/** A heading that lists what follows: "Operations on Stack ADT", "Types of Queue", "basic operations (…". */
const LIST_HEADING = /^(basic\s+|common\s+)?(operations?|types?|kinds?|implementations?|applications?|properties|functions?|methods?)\b/i;
/** Those headings' own words prove nothing: every question has an "operation". */
const LIST_WORDS = new Set("operation type kind implementation application property function method".split(" ").map(stem));

/** One syllabus line as separate topics. */
function expandTopic(text) {
  const out = [];
  const pieces = String(text)
    .replace(/[()[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(/\s+[–—-]\s+|\s*[–—]\s*|(?<=[a-z])-\s+(?=[A-Z])/);
  for (const p of pieces) {
    const m = /^(.*\S\s\S+)-(?=[A-Z])(\S+\s.*)$/.exec(p);
    if (m) out.push(m[1], m[2]);
    else out.push(p);
  }
  return out.map((p) => p.trim()).filter((p) => p.length >= 2);
}

/** The subject's syllabus as something to match against. */
export function syllabusIndex(topics, { title = "" } = {}) {
  const course = new Set(words(title));
  const items = [];
  let lastN = null;
  let context = null;
  // A checklist line keeps its heading with its parts ("Operations on
  // Stack ADT – Create, Push, Pop, Top", syllabus.mjs); matched, each part
  // is its own item under that heading.
  const expanded = (topics ?? []).flatMap((t) => {
    const parts = String(t.topic).split(/,\s+/);
    const { heading } = headed(parts[0]);
    if (parts.length < 2 || !heading) return [t];
    return [{ ...t, topic: parts[0] }, ...parts.slice(1).map((p) => ({ ...t, topic: `${heading} – ${p}` }))];
  });
  for (const t of expanded) {
    if (t.n !== lastN) {
      lastN = t.n;
      context = null;
    }
    const unitTitle = (t.unitTitle ?? "").trim();
    const vague = (h) => !h || VAGUE_HEADING.test(h);
    // "Types" → "Types of List Structure"; anything vaguer → the unit itself.
    const place = (h) =>
      !vague(h) ? h : !unitTitle ? null : h && LIST_HEADING.test(h) && isShort(h) ? `${h} of ${unitTitle}` : unitTitle;
    // Tutorial and lab tags ("T13: Building programs…") are not part of the name.
    const pieces = expandTopic(String(t.topic).replace(/^\s*(?:T|Lab|Ex)\s*\d+\s*[:.]\s*/i, ""));
    for (const [pi, piece] of pieces.entries()) {
      // "Hash functions – Introduction, functions": the first piece of a
      // dashed line is the heading of the short pieces after it.
      let { heading, item } = headed(piece);
      if (!heading && pi > 0 && isShort(piece) && !isShort(pieces[0])) heading = pieces[0];
      const explicit = !!heading;
      if (heading) context = place(heading);
      // A bare "Types" or "Properties" opens a list; it is not itself asked.
      if (!explicit && isShort(item) && LIST_HEADING.test(item)) {
        context = place(item);
        continue;
      }
      const fragment = isShort(item) && (explicit || GENERIC_ITEM.has(stem(words(item)[0] ?? item.toLowerCase())) || LIST_HEADING.test(context ?? ""));
      let group;
      let name = null;
      let termText;
      let ctxTerms = [];
      if (fragment) {
        const ctx = (explicit ? place(heading) : context) ?? (unitTitle || null);
        if (!ctx) continue;
        group = ctx;
        name = EMPTY_NAME.test(item) ? null : item;
        termText = `${item} ${ctx}`;
        ctxTerms = words(ctx).filter((w) => !course.has(w) && !LIST_WORDS.has(w));
        if (!ctxTerms.length) continue;
      } else {
        // A real topic. Its heading stays in the name only when it adds
        // something the item doesn't say: "Deadlocks: System Model", but
        // "Deadlock Avoidance", and never "Applications: …".
        const h = heading && !vague(heading) ? heading : null;
        const shares = h && words(h).some((w) => words(item).includes(w));
        group = h && !shares ? `${h}: ${item}` : item;
        termText = h ? `${h} ${item}` : item;
        if (!explicit) context = item;
      }
      const terms = [...new Set(words(termText))];
      if (!terms.length) continue;
      items.push({
        n: t.n,
        topic: t.topic,
        group: group.length > 70 ? `${group.slice(0, 67).replace(/\s+\S*$/, "")}…` : group,
        name,
        vector: t.vector ?? null,
        terms,
        ctxTerms,
        bigrams: new Set(terms.slice(1).map((w, i) => `${terms[i]} ${w}`)),
        weight: 0,
      });
    }
  }
  const df = new Map();
  for (const t of items) for (const w of t.terms) df.set(w, (df.get(w) ?? 0) + 1);
  const idf = (w) => (course.has(w) ? 0.1 : 1) * Math.log(1 + items.length / (df.get(w) ?? items.length));
  // A long topic ("Formation of partial differential equations by
  // eliminating arbitrary constants…") is judged on its four rarest words.
  for (const t of items)
    t.weight = t.terms
      .map(idf)
      .sort((a, b) => b - a)
      .slice(0, 4)
      .reduce((a, v) => a + v, 0);
  return { items, idf, distinctive: Math.log(1 + items.length / 3) };
}

/** The syllabus topic a question asks about, or null. */
export function matchSyllabus(question, index, { coverage = 0.6 } = {}) {
  if (!index?.items.length) return null;
  const q = words(question);
  const qs = new Set(q);
  const qb = new Set(q.slice(1).map((w, i) => `${q[i]} ${w}`));
  let best = null;
  let bestScore = 0;
  for (const t of index.items) {
    let got = 0;
    let hits = 0;
    let rare = false;
    for (const w of t.terms) {
      if (!qs.has(w)) continue;
      const v = index.idf(w);
      got += v;
      hits++;
      if (v >= index.distinctive) rare = true;
    }
    if (t.ctxTerms.length) {
      // An item under its heading: its own word, and a word of the
      // heading - "Delete" is only the list one if the question is
      // about lists; "ADT" never has to appear.
      const own = t.terms.filter((w) => !t.ctxTerms.includes(w));
      if (!own.some((w) => qs.has(w)) || !t.ctxTerms.some((w) => qs.has(w))) continue;
    } else if (!rare || got / t.weight < coverage || hits / Math.min(4, t.terms.length) < coverage) continue;
    let phrase = 0;
    for (const b of t.bigrams) if (qb.has(b)) phrase++;
    const score = got * Math.min(1, got / t.weight) + phrase;
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return best;
}

/** How close a question has to sit to a syllabus topic (gte-small) to be counted under it when their words don't meet. */
export const SYLLABUS_NEAR = 0.84;

/** Past-paper questions counted under the syllabus topics they ask about. */
export function groupBySyllabus(texts, vectors, index, floor = SYLLABUS_NEAR) {
  const groups = new Map();
  for (const [i, text] of texts.entries()) {
    let item = matchSyllabus(text, index);
    if (!item && vectors?.[i]) {
      let score = -Infinity;
      for (const t of index.items) {
        if (!t.vector) continue;
        const s = cosine(vectors[i], t.vector);
        if (s > score) {
          score = s;
          item = t;
        }
      }
      if (score < floor) item = null;
    }
    if (!item) continue;
    const key = `${item.n}|${item.group.toLowerCase()}`;
    const g = groups.get(key) ?? { members: [], n: item.n, group: item.group, names: new Map() };
    g.members.push(i);
    if (item.name) g.names.set(item.name, (g.names.get(item.name) ?? 0) + 1);
    groups.set(key, g);
  }
  return [...groups.values()].map((g) => {
    const names = [...g.names].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n]) => n);
    return { members: g.members, n: g.n, label: names.length ? `${g.group} — ${names.join(", ")}` : g.group };
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
/** `link(vector, subjectCode)`, when given, is asked for each topic kept and returns where to study it (see linkTopic in sync-study-folder.mjs); its answer is stored as the topic's `refs`. */
/** `unitVectors` (code → [{ n, vector }], from units.mjs), when given, places every question in its nearest syllabus unit: the subject gets `unitShare` (questions per unit) and each topic its `unit`. */
export function nearestUnit(vector, units) {
  let best = null;
  let score = -Infinity;
  for (const u of units) {
    const s = cosine(vector, u.vector);
    if (s > score) {
      score = s;
      best = u.n;
    }
  }
  return best;
}

/** `syllabi` (code → { title, topics: [{ n, unitTitle, topic, vector }] }, from units.mjs), when given, makes the topics the syllabus's own: each question is counted under the syllabus topic it asks about (`groupBySyllabus`), and questions the syllabus can't place are left out. */
export async function mineTopics({ files, url, key, link, unitVectors, syllabi, log = console.log }) {
  const subjects = pastPapers(files);
  if (subjects.length === 0) {
    log("Topics: no past papers found (looking for <subject folder>/07_PYQs/…).");
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
    const units = unitVectors?.get(subjectCode);
    const syllabus = syllabi?.get(subjectCode);
    const index = syllabus?.topics.length ? syllabusIndex(syllabus.topics, { title: syllabus.title }) : null;
    let groups0;
    if (index?.items.length) {
      groups0 = groupBySyllabus(
        questions.map((q) => q.text),
        vectors,
        index
      ).map((g) => ({ members: g.members, name: g.label, unit: g.n }));
    } else {
      const clusters = clusterVectors(vectors);
      const labels = labelClusters(clusters.map((c) => c.map((i) => questions[i].text)));
      groups0 = clusters.map((members, ci) => ({ members, name: labels[ci] || null, unit: null }));
    }

    // The topic as it was really asked: one question from each paper (the
    // one closest to the topic's most typical), newest paper first.
    const askedIn = (members, medoid) => {
      const best = new Map();
      for (const i of members) {
        const s = cosine(vectors[i], vectors[medoid]);
        const id = questions[i].paper.id;
        if (!best.has(id) || s > best.get(id).s) best.set(id, { i, s });
      }
      return [...best.values()]
        .map(({ i }) => ({ q: questions[i], i }))
        .sort((a, b) => (b.q.paper.year ?? 0) - (a.q.paper.year ?? 0))
        .slice(0, ASKED_PER_TOPIC)
        .map(({ q }) => ({
          ...splitAnswer(q.text),
          path: q.paper.files[0]?.path ?? null,
          year: q.paper.year ?? null,
          group: q.paper.group,
        }));
    };
    const topics = groups0
      .map(({ members, name, unit }) => {
        const papersHere = new Map(members.map((i) => [questions[i].paper.id, questions[i].paper]));
        const groups = {};
        for (const p of papersHere.values()) groups[p.group] = (groups[p.group] ?? 0) + 1;
        const years = [...papersHere.values()].map((p) => p.year).filter(Boolean);
        // The most typical question: highest average similarity to the rest.
        const medoid = members
          .map((i) => ({ i, s: members.reduce((a, j) => a + cosine(vectors[i], vectors[j]), 0) }))
          .sort((a, b) => b.s - a.s)[0].i;
        return {
          label: name ?? questions[medoid].text.slice(0, 60),
          ...(index ? { syllabus: true } : {}),
          example: questions[medoid].text.slice(0, 160),
          question: questions[medoid].text.slice(0, 400),
          vector: vectors[medoid],
          ...(unit != null ? { unit } : units?.length ? { unit: nearestUnit(vectors[medoid], units) } : {}),
          asked: askedIn(members, medoid),
          papers: papersHere.size,
          questions: members.length,
          latest: years.length ? Math.max(...years) : null,
          groups,
        };
      })
      .filter((t) => t.papers >= MIN_PAPERS)
      .sort((a, b) => b.papers - a.papers || (b.latest ?? 0) - (a.latest ?? 0) || b.questions - a.questions)
      .slice(0, TOPICS_PER_SUBJECT);

    for (const t of topics) {
      if (link) {
        try {
          t.refs = await link(t.vector, subjectCode);
        } catch (err) {
          log(`  couldn't link "${t.label}" to notes: ${err.message}`);
          t.refs = [];
        }
      }
      delete t.vector; // 384 floats each: not for topics.json
    }

    const groups = {};
    for (const p of papers) groups[p.group] = (groups[p.group] ?? 0) + 1;
    let unitShare;
    if (units?.length) {
      unitShare = {};
      for (const v of vectors) {
        const n = nearestUnit(v, units);
        unitShare[n] = (unitShare[n] ?? 0) + 1;
      }
    }
    out.push({ subject_code: subjectCode, papers: papers.length, questions: questions.length, groups, topics, ...(unitShare ? { unitShare } : {}) });
    const placed = index ? groups0.reduce((n, g) => n + g.members.length, 0) : questions.length;
    log(
      `  Topics · ${subjectCode}: ${papers.length} papers, ${questions.length} questions` +
        (index ? ` (${placed} placed in the syllabus)` : " (no syllabus: named from their words)") +
        ` → ${topics.length} repeated topics`
    );
  }

  mkdirSync(path.dirname(VECTOR_CACHE), { recursive: true });
  writeFileSync(VECTOR_CACHE, JSON.stringify(cache));
  return { version: 1, generatedAt: Date.now(), model: "gte-small", subjects: out };
}
