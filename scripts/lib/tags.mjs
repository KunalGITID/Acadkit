/** What a study-folder file is about, read off its path: subject code, unit and kind. */

const CODE = /(?<![A-Za-z0-9])(\d{2}[A-Z]{3}\d{3}[A-Z])(?![A-Za-z0-9])/;
const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6 };

/**
 * Subject codes by top-level folder. "DSA_21CSC201J" names its code; a
 * sibling without one ("DSA_Lab") takes the code of the folder sharing its
 * prefix ("DSA"), since the lab is part of the same course.
 */
export function subjectIndex(topFolders, titles = new Map()) {
  const byPrefix = new Map();
  const out = new Map();
  // "Operating_Systems" or "Data_Structures_and_Algorithms_Lab" names the
  // course by its title instead (`titles`: code → title, from the curriculum).
  const byTitle = new Map([...titles].map(([code, t]) => [words(t), code]));
  for (const f of topFolders) {
    const m = CODE.exec(f);
    const code = m?.[1] ?? byTitle.get(words(f)) ?? byTitle.get(words(f).replace(/ lab$/, ""));
    if (code) {
      out.set(f, code);
      const prefix = (m ? f.slice(0, m.index) : f).replace(/[_\s-]+$/, "").toLowerCase();
      if (prefix) byPrefix.set(prefix, code);
    }
  }
  for (const f of topFolders) {
    if (out.has(f)) continue;
    const prefix = f.split(/[_\s-]/)[0].toLowerCase();
    if (byPrefix.has(prefix)) out.set(f, byPrefix.get(prefix));
  }
  return out;
}

/** "Data_Structures_and_Algorithms" and "Data Structures & Algorithms" → "data structures and algorithms". */
function words(s) {
  return String(s).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
}

/** "Unit_3", "Unit-III", "unit 2", "OS_Unit_1.pdf", "Unit1_OS.pptx" → 3, 3, 2, 1, 1. */
export function unitOf(text) {
  const m = /(?:^|[^a-z])unit[\s_-]*(\d{1,2}|i{1,3}|iv|vi?)(?![a-z])/i.exec(String(text));
  if (!m) return null;
  const v = m[1].toLowerCase();
  const n = /^\d+$/.test(v) ? Number(v) : ROMAN[v];
  return n >= 1 && n <= 6 ? n : null;
}

/** Checked in order, folders before the file name; the first match wins. */
const KINDS = [
  ["pyq", /pyq|past.?papers?|question.?(papers?|banks?)|important.?topics/i],
  ["syllabus", /syllab(?:us|i)|handout|course.?plan/i],
  ["guide", /guide|test.?prep|problem.?bank/i],
  ["whatsapp", /whats.?app/i],
  ["lab", /lab|record|programs?|code/i],
  ["assignment", /assignment|tutorial/i],
  ["notes", /notes?|slides?|ppt|unit/i],
];

export function kindOf(rel, { topIsSubject = true } = {}) {
  const parts = String(rel).split("/");
  // Not the subject folder itself ("DSA_Lab" is not a lab file) - but a
  // top folder that is nobody's, like "Syllabi/", says what is in it.
  const folders = parts.slice(topIsSubject ? 1 : 0, -1).join("/");
  const file = parts[parts.length - 1];
  for (const where of [folders, file]) {
    if (!where) continue;
    for (const [kind, re] of KINDS) if (re.test(where)) return kind;
  }
  return "other";
}

/** Tags for one file. `subjects` is subjectIndex() over the top-level folders. */
export function tagFile(rel, subjects) {
  const top = String(rel).split("/")[0];
  const inFolder = rel.includes("/");
  // Outside a subject's folder, a course code in the file name still says
  // which subject it is ("Syllabi/Sem_4/21MAB301T_Probability….pdf").
  const named = CODE.exec(rel.split("/").pop() ?? "");
  return {
    subject_code: (inFolder && subjects.get(top)) || (named ? named[1] : null),
    unit: unitOf(rel.split("/").slice(1).join("/")),
    kind: kindOf(rel, { topIsSubject: inFolder && subjects.has(top) }),
  };
}
