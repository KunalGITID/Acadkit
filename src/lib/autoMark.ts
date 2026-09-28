import type { AttendanceRecord, TimetableSlot } from "@/types";

/** Auto-marking turns AcadKit from daily data entry into occasional correction: assume you attended every scheduled class, and let the user mark only the exceptions. */

export interface PendingMark {
  subject_id: string;
  date: string;
  start_time: string;
  end_time: string;
}

/** `subject|date|start_time` - the natural key of an attendance row. */
function markKey(
  subject_id: string,
  date: string,
  start_time: string
): string {
  return `${subject_id}|${date}|${start_time}`;
}

/** Every scheduled class strictly before `today` with no attendance row. */
export function pendingAutoMarks(
  timetable: TimetableSlot[],
  effMap: Record<string, number>,
  attendance: AttendanceRecord[],
  today: string,
  semStart: string
): PendingMark[] {
  const marked = new Set(
    attendance.map((a) => markKey(a.subject_id, a.date, a.start_time))
  );

  const slotsByDayOrder = new Map<number, TimetableSlot[]>();
  for (const slot of timetable) {
    const list = slotsByDayOrder.get(slot.day_order) ?? [];
    list.push(slot);
    slotsByDayOrder.set(slot.day_order, list);
  }

  const dates = Object.keys(effMap)
    .filter((d) => d >= semStart && d < today)
    .sort();

  const out: PendingMark[] = [];
  for (const date of dates) {
    for (const slot of slotsByDayOrder.get(effMap[date]) ?? []) {
      if (marked.has(markKey(slot.subject_id, date, slot.start_time))) continue;
      out.push({
        subject_id: slot.subject_id,
        date,
        start_time: slot.start_time,
        end_time: slot.end_time,
      });
    }
  }
  return out;
}

/**
 * A one-line summary of what auto-marking is about to do, for the
 * confirmation the user sees before any row is written.
 */
export function describePending(pending: PendingMark[]): string {
  if (!pending.length) return "Nothing to catch up - every past class is marked.";
  const days = new Set(pending.map((p) => p.date)).size;
  return (
    `Mark ${pending.length} class${pending.length > 1 ? "es" : ""} as present ` +
    `across ${days} day${days > 1 ? "s" : ""}.`
  );
}
