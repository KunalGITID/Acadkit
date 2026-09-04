import type { SubjectAttendance } from "@/lib/attendance";
import type { AttendanceRecord } from "@/types";

/**
 * The semester, counted up.
 *
 * A recap only works if every line is true. The temptation with this
 * format is to manufacture superlatives — "your best week!", "a record
 * streak!" — from data that doesn't support them, and one invented stat
 * makes the reader distrust the other nine. So everything here is a
 * direct count of something recorded, and anything that can't be
 * computed comes back null for the UI to drop rather than guess at.
 *
 * The one derived figure is hours, which is classes × the length of a
 * period. That's an assumption, so it's a named constant rather than a
 * magic number, and it's the only one.
 */

/** An SRM period. Hours are classes × this, and nothing else. */
export const MINUTES_PER_CLASS = 50;

export interface SubjectHighlight {
  name: string;
  color: string;
  percentage: number;
}

export interface Wrapped {
  /** Classes sat through, from the portal-aware totals. */
  attended: number;
  /** Classes missed. */
  missed: number;
  /** Hours spent in a classroom, rounded down — never rounded up. */
  hours: number;
  /** Best and worst subject by attendance. Null until two subjects have data. */
  best: SubjectHighlight | null;
  worst: SubjectHighlight | null;
  /** Longest run of consecutive marked days with no absence. */
  cleanStreak: number;
  /** Day order you miss most, and how many classes on it. Null if never absent. */
  worstDayOrder: { dayOrder: number; missed: number } | null;
  /** Days with at least one class marked. */
  daysMarked: number;
  /** True when there is too little recorded to say anything. */
  empty: boolean;
}

export function buildWrapped(
  subjects: SubjectAttendance[],
  records: AttendanceRecord[],
  effMap: Record<string, number>
): Wrapped {
  const withData = subjects.filter((s) => s.total > 0 && s.percentage !== null);
  const attended = withData.reduce((n, s) => n + s.attended, 0);
  const total = withData.reduce((n, s) => n + s.total, 0);
  const missed = total - attended;

  const ranked = [...withData].sort((a, b) => b.percentage! - a.percentage!);
  const highlight = (s: SubjectAttendance | undefined): SubjectHighlight | null =>
    s ? { name: s.subject.name, color: s.subject.color_hex, percentage: s.percentage! } : null;

  // Best and worst are only meaningful against each other. With one
  // subject they'd be the same row printed twice.
  const best = ranked.length >= 2 ? highlight(ranked[0]) : null;
  const worst = ranked.length >= 2 ? highlight(ranked[ranked.length - 1]) : null;

  const { cleanStreak, daysMarked } = streaks(records);

  return {
    attended,
    missed,
    hours: Math.floor((attended * MINUTES_PER_CLASS) / 60),
    best,
    worst,
    cleanStreak,
    worstDayOrder: worstDayOrder(records, effMap),
    daysMarked,
    empty: total === 0,
  };
}

/**
 * Longest run of consecutive *marked* days with no absence.
 *
 * Unmarked days break nothing — they're missing data, not a bad day, and
 * treating a forgotten Tuesday as a broken streak would punish you for
 * not using the app. Cancelled classes ("holiday") are ignored entirely.
 */
function streaks(records: AttendanceRecord[]): { cleanStreak: number; daysMarked: number } {
  const byDate = new Map<string, { present: number; absent: number }>();
  for (const r of records) {
    if (r.status !== "present" && r.status !== "absent") continue;
    const cell = byDate.get(r.date) ?? { present: 0, absent: 0 };
    if (r.status === "present") cell.present++;
    else cell.absent++;
    byDate.set(r.date, cell);
  }

  let best = 0;
  let run = 0;
  for (const date of [...byDate.keys()].sort()) {
    if (byDate.get(date)!.absent === 0) {
      run++;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }
  return { cleanStreak: best, daysMarked: byDate.size };
}

/** The day order that absorbs the most absences. */
function worstDayOrder(
  records: AttendanceRecord[],
  effMap: Record<string, number>
): { dayOrder: number; missed: number } | null {
  const tally = new Map<number, number>();
  for (const r of records) {
    if (r.status !== "absent") continue;
    const dayOrder = effMap[r.date];
    if (!dayOrder) continue;
    tally.set(dayOrder, (tally.get(dayOrder) ?? 0) + 1);
  }
  if (tally.size === 0) return null;

  const [dayOrder, missed] = [...tally.entries()].sort(
    // Ties go to the lower day order, so the answer is stable rather than
    // depending on Map insertion order.
    (a, b) => b[1] - a[1] || a[0] - b[0]
  )[0];
  return { dayOrder, missed };
}
