import { labelMatchKey } from "@/lib/componentLabel";

/**
 * What to study for each upcoming test, as the weekly scan worked it
 * out from the study folder: the portion, the paper's pattern, which
 * topics past papers keep asking, and the files to open. Written by the
 * scan to _src/acadkit_prep.json and uploaded by the sync as
 * <pin>/prep.json; nothing here is computed from marks.
 */

export interface PrepTopic {
  topic: string;
  unit?: string | null;
  /** How many of the analysed papers asked it. */
  seen: number;
  /** How many papers were analysed for this test. */
  of: number;
}

export interface PrepTest {
  subject_code: string;
  /** The component, as the source writes it ("FJ-II"). */
  label?: string | null;
  /** ISO with offset. */
  due_date: string;
  title: string;
  portion?: string | null;
  pattern?: string | null;
  topics: PrepTopic[];
  files: { path: string; why?: string | null }[];
}

export interface PrepData {
  version: 1;
  generatedAt: number;
  tests: PrepTest[];
}

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const localDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA");

/** Stable id for a test — used in the Study page's ?prep= link. */
export function prepId(t: Pick<PrepTest, "subject_code" | "label" | "due_date">): string {
  return `${norm(t.subject_code)}-${t.label ? labelMatchKey(t.label) : "x"}-${localDay(t.due_date)}`;
}

/** Tests still ahead, soonest first. A test stays until the day is over. */
export function upcomingPrep(data: PrepData | null | undefined, now: number): PrepTest[] {
  const today = new Date(now).toLocaleDateString("en-CA");
  return (data?.tests ?? [])
    .filter((t) => !Number.isNaN(new Date(t.due_date).getTime()) && localDay(t.due_date) >= today)
    .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
}

// ---------- past-paper topics (scripts/study-index/topics.mjs) ----------

/** One repeated topic, as the sync mined it from past papers. */
export interface MinedTopic {
  label: string;
  /** The most typical question in the group. */
  example: string;
  /** Different papers that asked it. */
  papers: number;
  questions: number;
  latest: number | null;
  /** Papers that asked it, per 07_PYQs folder: { "End_Sem": 4, "FJ-II": 1 }. */
  groups: Record<string, number>;
}

export interface SubjectTopics {
  subject_code: string;
  papers: number;
  questions: number;
  /** Papers per 07_PYQs folder. */
  groups: Record<string, number>;
  topics: MinedTopic[];
}

export interface TopicsData {
  version: 1;
  generatedAt: number;
  model: string;
  subjects: SubjectTopics[];
}

/** What a test or a papers folder is, as one comparable key: FJ-II ≡ FT-2 → "f2". */
function testKey(label: string): string {
  const key = labelMatchKey(label);
  return /^(endsem|final)/.test(key) ? "endsem" : key;
}

/** "FT-I_&_FT-II_mixed" → ["f1", "f2"]; "End_Sem" → ["endsem"]. */
export function groupKeys(folder: string): string[] {
  return folder
    .split(/&|,|\+|\band\b/i)
    .map((part) => part.replace(/mixed/i, "").replace(/^[\s_-]+|[\s_-]+$/g, ""))
    .filter(Boolean)
    .map(testKey);
}

export interface TestTopics {
  /** "test" when the test's own past papers were found, else the whole subject. */
  scope: "test" | "subject";
  /** Papers the counts are out of. */
  papers: number;
  topics: Array<MinedTopic & { count: number }>;
}

/**
 * The mined topics that fit a test: counted over the papers of the same
 * test (FJ-II's for FJ-II) when there are any, otherwise over all of the
 * subject's papers.
 */
export function topicsForTest(
  data: TopicsData | null | undefined,
  test: Pick<PrepTest, "subject_code" | "label">,
  limit = 6
): TestTopics | null {
  const subject = data?.subjects.find((s) => norm(s.subject_code) === norm(test.subject_code));
  if (!subject || subject.topics.length === 0) return null;
  const key = test.label ? testKey(test.label) : null;
  const matching = key ? Object.keys(subject.groups).filter((g) => groupKeys(g).includes(key)) : [];

  if (matching.length) {
    const topics = subject.topics
      .map((t) => ({ ...t, count: matching.reduce((a, g) => a + (t.groups[g] ?? 0), 0) }))
      .filter((t) => t.count > 0)
      .sort((a, b) => b.count - a.count || b.papers - a.papers);
    if (topics.length) {
      return {
        scope: "test",
        papers: matching.reduce((a, g) => a + (subject.groups[g] ?? 0), 0),
        topics: topics.slice(0, limit),
      };
    }
  }
  return {
    scope: "subject",
    papers: subject.papers,
    topics: subject.topics.slice(0, limit).map((t) => ({ ...t, count: t.papers })),
  };
}
