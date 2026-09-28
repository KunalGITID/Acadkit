/** A course's chapters, read straight off its syllabus PDF. */

const UNIT_HEAD = /\bUnit\s*[-–—]?\s*(\d|I{1,3}|IV|V)\s*[-–—:]\s*(.+?)\s+(\d{1,2})\s*Hours?\b/gi;
const ROMAN = { I: 1, II: 2, III: 3, IV: 4, V: 5 };

/** Where a unit's text stops. */
const UNIT_END =
  /\b(?:Tutorials?\s*:|Lab(?:oratory)?\s+Experiments|Practical\s*:|Practice\s*:|Learning\s+Resources|Learning\s+Assessment|Course\s+Designers|Lab\s*\d+\s*:|[TP]\d{1,2}\s*:)|\n\s*\d+\.\s+\d+\.\s/i;

const FOOTER = /B\.\s?Tech\s*\/\s*M\.\s?Tech[^\n]*?(?:Control\s+Copy|Regulations[^\n]*)/gi;

/** Words that make a line a book reference, not a topic. */
const REFERENCE =
  /\b(?:\d+(?:st|nd|rd|th)\s+(?:ed(?:ition)?|revised)|edition|\d+\/e|McGraw|Pearson|Wiley|Prentice|PHI\b|Springer|Elsevier|O'?Reilly|Cengage|Dreamtech|Oxford\s+University|Cambridge\s+University|University\s+Press|Publish|Press\b|ISBN|Vol\.|pp\.)/i;

/**
 * Anything the checklist should not show: a year, an edition, a
 * publisher, a person's name, a number. Used on topics from any source,
 * so a syllabus the PDF couldn't be read for is still cleaned.
 */
export function isJunkTopic(t) {
  const s = String(t).trim();
  if (s.length < 2) return true;
  if (!/[a-z]{2}/i.test(s)) return true; // "2011", "8/e", "1. 2."
  if (/^(?:19|20)\d{2}\b/.test(s) || /\b(?:19|20)\d{2}\.?$/.test(s)) return true;
  if (REFERENCE.test(s)) return true;
  return false;
}

/** Topics from any source, cleaned for the checklist: a list that runs on into the Learning Resources is cut where they begin (a person's name can't be told from a topic's, but everything after the first book is a book), and tutorial and lab items are dropped. */
export function cleanTopics(topics) {
  const out = [];
  for (const raw of topics ?? []) {
    const t = String(raw).replace(/\s+/g, " ").trim();
    if (/learning\s+resources|learning\s+assessment|course\s+designers/i.test(t)) break;
    if (REFERENCE.test(t) && out.length) {
      // A book entry runs author, title, edition: the name and the title
      // just before the first edition or publisher belong to it.
      for (let k = 0; k < 2 && out.length; k++) {
        const prev = out[out.length - 1];
        if (/:/.test(prev) || /^(?:[A-Z]\.\s*)*[A-Z][a-z]+(?:\s+(?:[A-Z]\.?|[A-Z][a-z]+)){1,2}\.?$/.test(prev)) out.pop();
        else break;
      }
      break;
    }
    if (/^(?:tutorials?|lab\s+experiments?)\b|^(?:T|P|Lab)\s*\d+\s*:/i.test(t)) continue;
    if (!isJunkTopic(t) && !out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t);
  }
  return out;
}

/** Split on commas and semicolons that are not inside brackets. */
function splitTop(s, seps = /[,;]/) {
  const out = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
    if (depth === 0 && seps.test(ch)) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

const wordCount = (s) => s.split(/\s+/).filter((w) => !/^(and|or|of|the|a|an|in|on|to|with|for)$/i.test(w)).length;
const DASH = /\s+[-–—]\s*|\s*[–—]\s*|(?<=[a-z)])-\s+(?=[A-Z])/;
/** A dash, colon or "--" between a heading and what it introduces. */
const HEAD_DASH = /\s*:\s+|\s*--\s*|\s+[-–—]\s*|\s*[–—]\s*|(?<=[a-z)])-\s+(?=[A-Z])/;
const VERB_ITEM =
  /^(?:Use|Using|Develop|Implement|Create|Perform|Debug|Classify|Load|Render|Install|Installing|Build|Building|Design|Apply|Write|Choose|Choosing|Working|Explore|Handle|Handling)\b/;
const GENERIC_HEADING = /^(?:types?|operations?|applications?|implementations?|introduction|properties|features|methods?|techniques?|kinds?|basics?)$/i;

/** One unit's text as checklist topics, in order: */
export function unitTopics(body) {
  const text = String(body)
    .replace(FOOTER, ", ")
    .replace(/-\n(?=[a-z])/g, "")
    .replace(/-\n(?=[A-Z])/g, "-")
    .replace(/\s*\n\s*/g, " ")
    .replace(/\s+/g, " ")
    // "process-Introduction", "large data- General": a hyphen after a word
    // in lower case separates two topics. After a capital it is a compound
    // ("Real-Time", "Operating-System") and stays.
    .replace(/(?<=\b[a-z][a-z]+)-\s*(?=[A-Z][a-z])/g, ", ")
    // "Z - transforms" is one word.
    .replace(/\b([A-Z])\s+-\s+(?=[a-z])/g, "$1-")
    // "…large data sets Introduction to Pandas": a new topic with no comma before it.
    .replace(/(?<=[a-z]) (?=Introduction to )/g, ", ")
    .trim()
    // "che Storm – …": the tail of a word broken across the header line.
    .replace(/^[a-z]{1,4}\s+(?=[A-Z])/, "");
  const topics = [];
  // Sentences first: "Virtual Memory: Introduction, Demand Paging." ends a heading's reach.
  // A full stop ends a heading's reach, with or without a space after it
  // ("String.Collections framework", "Vector class. -Operators").
  const sentences = splitTop(text, /[;]/).flatMap((s) => s.split(/\.\s*(?=[-–]?\s*[A-Z][a-z])|\.\s+(?=[A-Z])|\.$/));
  for (const sentence of sentences) {
    // "Abstract Classes, and Methods" is one item.
    let parts = splitTop(sentence.replace(/^[\s–—-]+/, ""))
      .flatMap((p) =>
        // Only where the line uses hyphens alone; en dashes mean the
        // dash-chain style below ("Fourier transform pair – Properties -Fourier…").
        !/[–—]/.test(p) && (p.match(/(?<=[A-Za-z)])\s*-\s*(?=[A-Z])/g) ?? []).length >= 2 ? p.split(/(?<=[A-Za-z)])\s*-\s*(?=[A-Z])/) : [p]
      )
      .reduce((acc, p) => {
      if (/^(?:[Aa]nd|with|for)\s/.test(p) && acc.length) acc[acc.length - 1] += ` ${p}`;
      else acc.push(p);
      return acc;
    }, []);
    if (!parts.length) continue;
    // A chain with dashes and no commas is a list of topics, not a heading.
    if (parts.length === 1) {
      const chain = parts[0].split(DASH).map((x) => x.trim()).filter(Boolean);
      if (chain.length > 2 && chain.filter((c) => wordCount(c) >= 2).length * 2 >= chain.length) {
        // "Fourier transform pair – Properties", "Time series – date
        // functionality": a lone word or a lower-case piece belongs to the one before.
        const merged = [];
        for (const c of chain) {
          if (merged.length && (wordCount(c) <= 1 || /^[a-z]/.test(c))) merged[merged.length - 1] += ` – ${c}`;
          else merged.push(c);
        }
        topics.push(...merged);
        continue;
      }
    }
    // Walk the items, tracking the heading a dash or colon introduces.
    let heading = null;
    let run = [];
    const flushRun = () => {
      if (!run.length) return;
      // Keep a heading with its items when they are its parts ("Create, Push, Pop, Top") or there are only one or two ("Dijkstra's Algorithm"); a longer list of real topics is split so each can be ticked.
      const singles = run.filter((r) => wordCount(r) <= 1).length;
      const together = heading && (singles * 2 >= run.length || (run.length <= 2 && run.every((r) => wordCount(r) <= 3)));
      if (heading && /^[A-Z\s&-]{4,}$/.test(heading)) heading = heading.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
      if (together) topics.push(`${heading} – ${run.join(", ")}`);
      else {
        const specific = heading && !GENERIC_HEADING.test(heading);
        const prefix = specific && wordCount(heading) <= 2;
        // A long specific heading is a topic of its own ("Primitive Data types").
        if (specific && !prefix) topics.push(heading);
        for (const r of run) {
          // "Hash functions – Introduction, functions": the item that just
          // repeats its heading goes.
          if (heading && heading.toLowerCase().includes(r.toLowerCase())) continue;
          const inside = heading && r.toLowerCase().includes(heading.toLowerCase().replace(/s$/, ""));
          topics.push(prefix && !inside ? `${heading}: ${r}` : r);
        }
      }
      run = [];
    };
    let verbTopic = null;
    const flushVerb = () => {
      if (verbTopic) topics.push(verbTopic);
      verbTopic = null;
    };
    for (let p of parts) {
      // "Write and Parse JSON file - JSON Conversion – to dictionary": the
      // instruction is the first piece; the rest is a heading and its item.
      const verbPieces = p.split(HEAD_DASH);
      if (VERB_ITEM.test(p) && verbPieces.length > 2) {
        flushRun();
        flushVerb();
        topics.push(verbPieces[0].trim());
        p = verbPieces.slice(1).join(" – ");
      }
      // "Use URLConf – URL Mapping", "Create Views": a topic written as an instruction is a topic of its own, never a heading for what follows; only its own short items join it ("Use Classes, Objects and Attributes", "… Basic Functions – findall(), search()").
      if (VERB_ITEM.test(p) && wordCount(p) >= 2) {
        flushRun();
        flushVerb();
        heading = null;
        verbTopic = p.replace(HEAD_DASH, " – ");
        continue;
      }
      if (verbTopic && wordCount(p) <= 2 && !HEAD_DASH.test(p)) {
        verbTopic += `, ${p}`;
        continue;
      }
      flushVerb();
      // "Operators -Control Statements-- Selection Statements": every piece
      // but the last two is a topic, the second-to-last heads the last.
      const pieces = p.split(HEAD_DASH).map((x) => x.trim()).filter(Boolean);
      if (pieces.length === 1) {
        run.push(p);
        continue;
      }
      let head = pieces[pieces.length - 2];
      // "throws and finally Input/Output - I/O Basics": a heading that
      // starts in lower case is the end of the last item run into the next heading.
      const m = /^([a-z].*?)\s+([A-Z][\w/().]*(?:\s+[\w/().]+)*)$/.exec(head);
      if (m && pieces.length === 2) {
        run.push(m[1]);
        head = m[2];
      }
      // Too long to be a heading: an item of its own, and the end of the
      // previous heading's reach.
      if (wordCount(head) > 5) {
        flushRun();
        heading = null;
        run.push(p);
        continue;
      }
      flushRun();
      heading = null;
      for (const lone of pieces.slice(0, -2)) run.push(lone);
      flushRun();
      const last = pieces[pieces.length - 1];
      // "HTTP webserver concepts - Use HTTP request and response objects"
      if (VERB_ITEM.test(last) && wordCount(last) >= 2) {
        topics.push(head);
        verbTopic = last;
        continue;
      }
      heading = head;
      run.push(last);
    }
    flushRun();
    flushVerb();
  }
  const seen = new Set();
  return topics
    .map((t) => t.replace(/^[\s.,;:–-]+|[\s.,;:–-]+$/g, "").trim())
    .filter((t) => {
      const k = t.toLowerCase();
      if (isJunkTopic(t) || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

/**
 * The course's units off its syllabus text: [{ n, title, hours, topics }],
 * or [] when the text isn't a syllabus with units. `code` limits it to
 * that course when a PDF holds several.
 */
export function parseSyllabusText(raw, code = null) {
  let text = String(raw ?? "");
  if (code) {
    // Keep only this course: from its "Course Code <code>" to the next course's.
    const starts = [...text.matchAll(/Course\s*Code\s*(\d{2}[A-Z]{3}\d{3}[A-Z])/gi)];
    const i = starts.findIndex((m) => m[1].toUpperCase() === code.toUpperCase());
    if (i >= 0) text = text.slice(starts[i].index, starts[i + 1]?.index ?? text.length);
    else if (starts.length) return [];
  }
  const heads = [...text.matchAll(UNIT_HEAD)];
  const units = [];
  for (const [i, h] of heads.entries()) {
    const n = /^\d$/.test(h[1]) ? Number(h[1]) : ROMAN[h[1].toUpperCase()];
    if (!n || units.some((u) => u.n === n)) continue;
    let body = text.slice(h.index + h[0].length, heads[i + 1]?.index ?? text.length);
    const end = body.search(UNIT_END);
    if (end >= 0) body = body.slice(0, end);
    const topics = cleanTopics(unitTopics(body));
    if (!topics.length) continue;
    units.push({ n, title: h[2].replace(/\s+/g, " ").trim(), hours: Number(h[3]), topics });
  }
  return units.sort((a, b) => a.n - b.n);
}
