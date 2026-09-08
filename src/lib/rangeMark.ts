import type { AttendanceRecord, AttendanceStatus, TimetableSlot } from "@/types";

/**
 * Marking a stretch of days in one go.
 *
 * The day sheet marks one date, which is right for the daily case and
 * wrong for the one that actually loses attendance: coming back from a
 * week away and facing five separate days of six taps each. What
 * happens instead is that it doesn't get done, and a fortnight later
 * the percentage on screen is confidently wrong.
 *
 * The same walk as auto-marking — day-order calendar, timetable, skip
 * what's already answered — with three differences that matter:
 *
 *  - **Any status, not just present.** The reason to mark a range is
 *    usually that you were absent for it.
 *  - **The future is allowed.** Marking next week off in advance is a
 *    real thing people do, and the projection engine already handles a
 *    future record correctly.
 *  - **One subject, optionally.** Missing a week of one lab is far more
 *    common than missing everything.
 *
 * What is never done silently is overwriting an answer you already
 * gave. Existing rows are skipped unless `replace` is asked for, and
 * either way the count is shown before anything is written.
 */

export interface PlannedMark {
  subject_id: string;
  date: string;
  start_time: string;
  end_time: string;
}

export interface RangeMarkInput {
  from: string;
  to: string;
  timetable: TimetableSlot[];
  /** Effective date → day order, holidays already removed. */
  effMap: Record<string, number>;
  attendance: AttendanceRecord[];
  /** Limit to one subject, or null for every class in the range. */
  subjectId?: string | null;
  /** Overwrite days you have already marked. Off by default. */
  replace?: boolean;
}

export interface RangePlan {
  /** Classes that will be written. */
  marks: PlannedMark[];
  /** Working days the range covers. */
  days: number;
  /** Classes left alone because they are already marked. */
  alreadyMarked: number;
}

const key = (subjectId: string, date: string, start: string) =>
  `${subjectId}|${date}|${start}`;

export function planRangeMarks({
  from,
  to,
  timetable,
  effMap,
  attendance,
  subjectId = null,
  replace = false,
}: RangeMarkInput): RangePlan {
  // A range entered backwards is a slip, not an empty range: reading it
  // the way it was obviously meant beats silently doing nothing.
  const start = from <= to ? from : to;
  const end = from <= to ? to : from;

  const marked = new Set(attendance.map((a) => key(a.subject_id, a.date, a.start_time)));

  const byDayOrder = new Map<number, TimetableSlot[]>();
  for (const slot of timetable) {
    if (subjectId && slot.subject_id !== subjectId) continue;
    const list = byDayOrder.get(slot.day_order) ?? [];
    list.push(slot);
    byDayOrder.set(slot.day_order, list);
  }

  const marks: PlannedMark[] = [];
  let days = 0;
  let alreadyMarked = 0;

  for (const date of Object.keys(effMap).sort()) {
    if (date < start || date > end) continue;
    days++;
    for (const slot of byDayOrder.get(effMap[date]) ?? []) {
      if (marked.has(key(slot.subject_id, date, slot.start_time))) {
        alreadyMarked++;
        if (!replace) continue;
      }
      marks.push({
        subject_id: slot.subject_id,
        date,
        start_time: slot.start_time,
        end_time: slot.end_time,
      });
    }
  }

  return { marks, days, alreadyMarked };
}

/** How each status reads in a sentence about a range. */
const WORD: Record<AttendanceStatus, string> = {
  present: "present",
  absent: "absent",
  holiday: "cancelled",
  od: "on duty",
};

/**
 * Exactly what is about to happen, for the confirmation.
 *
 * A bulk write to attendance is the most consequential thing this app
 * does — every percentage, budget and projection moves — so the count
 * is stated before it happens rather than reported after.
 */
export function describeRangePlan(plan: RangePlan, status: AttendanceStatus): string {
  if (!plan.marks.length) {
    if (plan.alreadyMarked > 0)
      return `Every class in those ${plan.days} days is already marked.`;
    return plan.days > 0
      ? "No classes scheduled in that range."
      : "No working days in that range.";
  }
  const n = plan.marks.length;
  const skipped =
    plan.alreadyMarked > 0
      ? ` ${plan.alreadyMarked} already-marked class${plan.alreadyMarked === 1 ? "" : "es"} left alone.`
      : "";
  return (
    `Mark ${n} class${n === 1 ? "" : "es"} ${WORD[status]} across ` +
    `${plan.days} day${plan.days === 1 ? "" : "s"}.${skipped}`
  );
}
