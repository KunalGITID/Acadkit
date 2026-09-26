import { addDays, toISODate } from "@/lib/dates";
import type { StudyLogEntry } from "@/types";

/**
 * The daily study check-in, as pure functions.
 *
 * Replaced the study planner, which told you when to study from a model
 * of your free periods. This asks what you actually did, once a day, and
 * keeps the answer — a record you can look back on, where the planner's
 * suggestions were forgotten the moment the day moved on.
 */

/** From this hour the question is about today; before it, today isn't over. */
export const ASK_FROM_HOUR = 18;

/**
 * Which day to ask about right now, or null for none.
 *
 * Evening: today, until it's answered. Earlier in the day: yesterday, if
 * it went unanswered — you're more likely to open the app the next
 * morning than at 11pm, and a missed evening shouldn't become a hole.
 * Only one day back: asking about last Tuesday gets a guess, not a record.
 * `skipped` holds days you waved away with "Later".
 */
export function studyPromptDate(
  log: StudyLogEntry[],
  now: Date = new Date(),
  skipped: ReadonlySet<string> = new Set()
): { date: string; which: "today" | "yesterday" } | null {
  const answered = new Set(log.map((e) => e.date));
  const today = toISODate(now);
  if (now.getHours() >= ASK_FROM_HOUR) {
    return answered.has(today) || skipped.has(today) ? null : { date: today, which: "today" };
  }
  const yesterday = addDays(today, -1);
  return answered.has(yesterday) || skipped.has(yesterday) ? null : { date: yesterday, which: "yesterday" };
}

/**
 * An even split of `total` minutes across `n` subjects, in quarter-hours,
 * with any remainder on the first — so two hours over OS and AOOP opens
 * as an hour each, and the numbers always add back up to the total.
 */
export function evenSplit(total: number, n: number): number[] {
  if (n <= 0) return [];
  const each = Math.floor(total / n / 15) * 15;
  const out = Array.from({ length: n }, () => each);
  out[0] += total - each * n;
  return out;
}

/** "1h 30m", "45m", "2h". */
export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export interface StudyDaySummary {
  date: string;
  total: number;
  /** Subjects that day, most time first. Empty on a day you didn't study. */
  bySubject: Array<{ subject_id: string; minutes: number }>;
}

/** The log as days, newest first. */
export function studyDays(log: StudyLogEntry[]): StudyDaySummary[] {
  const byDate = new Map<string, StudyDaySummary>();
  for (const e of log) {
    const day = byDate.get(e.date) ?? { date: e.date, total: 0, bySubject: [] };
    if (e.subject_id && e.minutes > 0) {
      day.total += e.minutes;
      const row = day.bySubject.find((r) => r.subject_id === e.subject_id);
      if (row) row.minutes += e.minutes;
      else day.bySubject.push({ subject_id: e.subject_id, minutes: e.minutes });
    }
    byDate.set(e.date, day);
  }
  for (const d of byDate.values()) d.bySubject.sort((a, b) => b.minutes - a.minutes);
  return [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));
}

/** Time per subject across the whole log, most first. */
export function studyTotals(log: StudyLogEntry[]): Array<{ subject_id: string; minutes: number }> {
  const totals = new Map<string, number>();
  for (const e of log) {
    if (e.subject_id && e.minutes > 0) totals.set(e.subject_id, (totals.get(e.subject_id) ?? 0) + e.minutes);
  }
  return [...totals.entries()]
    .map(([subject_id, minutes]) => ({ subject_id, minutes }))
    .sort((a, b) => b.minutes - a.minutes);
}

/**
 * Days in a row, ending today or yesterday, with some study logged.
 * A rest day you logged breaks it the same as a day you didn't log —
 * this counts study, not check-ins.
 */
export function studyStreak(log: StudyLogEntry[], now: Date = new Date()): number {
  const studied = new Set(log.filter((e) => e.minutes > 0).map((e) => e.date));
  let day = toISODate(now);
  if (!studied.has(day)) day = addDays(day, -1);
  let n = 0;
  while (studied.has(day)) {
    n++;
    day = addDays(day, -1);
  }
  return n;
}
