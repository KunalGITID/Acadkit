import type { AttendanceRecord, TimetableSlot } from "@/types";

/**
 * Classes that happened but aren't on the timetable.
 *
 * Makeup lectures, an extra lab before a deadline, a slot swapped in
 * for one that was cancelled — routine, and they count toward
 * attendance exactly like anything else. The data layer always allowed
 * them: an `attendance` row is keyed by (subject, date, start_time) and
 * never had to correspond to a `timetable_slots` row. What was missing
 * was any way to say so, because the day sheet derives its rows from
 * the timetable, so a class not on it had nowhere to be marked. The
 * workaround was adding a permanent slot and deleting it afterwards,
 * which corrupts every projection in between.
 *
 * They are not stored separately. A recorded class the timetable
 * doesn't schedule *is* the extra class — deriving them keeps one
 * source of truth and means an extra class survives a timetable edit.
 */

/** Same identity the day sheet and mark row use to pair rows with slots. */
const slotKey = (subjectId: string, startTime: string) => `${subjectId}|${startTime}`;

/** A stand-in slot so an extra class renders through the normal row. */
export type ExtraSlot = TimetableSlot & { extra: true };

export function extraClassesFor(
  date: string,
  records: AttendanceRecord[],
  scheduled: TimetableSlot[],
  dayOrder: number
): ExtraSlot[] {
  const onTimetable = new Set(scheduled.map((s) => slotKey(s.subject_id, s.start_time)));

  return records
    .filter((r) => r.date === date && !onTimetable.has(slotKey(r.subject_id, r.start_time)))
    .sort((a, b) => a.start_time.localeCompare(b.start_time))
    .map((r) => ({
      // Not a real slot and deliberately not given a real slot's id:
      // anything keying off this must not mistake it for one.
      id: `extra:${r.subject_id}:${r.start_time}`,
      device_id: r.device_id,
      subject_id: r.subject_id,
      day_order: dayOrder,
      start_time: r.start_time,
      end_time: r.end_time,
      room: null,
      extra: true,
    }));
}

/** Default end time for a class added by hand: one 50-minute period. */
export function defaultEndTime(startTime: string): string {
  const [h, m] = startTime.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return startTime;
  const total = h * 60 + m + 50;
  const hh = String(Math.floor(total / 60) % 24).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}
