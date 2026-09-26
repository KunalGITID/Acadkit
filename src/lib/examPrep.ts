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
