import { buildEffectiveMap, semesterWindow, type SemesterWindow } from "@/lib/calendar";
import { timeToMinutes, toISODate } from "@/lib/dates";
import type { DeclaredHoliday, TimetableSlot } from "@/types";

/** When you are actually going to prepare for this. */

/** Shorter than this is a corridor, not a study session. */
export const MIN_PREP_MINUTES = 45;

export interface PrepWindow {
  date: string;
  dayOrder: number;
  start: string; // "HH:MM"
  end: string;
  minutes: number;
  /** The classes it sits between, so a row can say where you'll be. */
  afterSubjectId: string;
  beforeSubjectId: string;
}

export interface PrepOptions {
  /** The deadline, as the ISO timestamp stored on the row. */
  due: string;
  /** Search from this date; defaults to today. */
  from?: string;
  /**
   * Minutes past midnight already spent on `from` - a gap you are
   * sitting in the far end of is not a plan.
   */
  fromMinutes?: number;
  timetable: TimetableSlot[];
  declared?: DeclaredHoliday[];
  window?: SemesterWindow;
  minMinutes?: number;
}

/** Free periods between now and the deadline, earliest first. */
export function prepWindows({
  due,
  from,
  fromMinutes = 0,
  timetable,
  declared = [],
  window = semesterWindow(),
  minMinutes = MIN_PREP_MINUTES,
}: PrepOptions): PrepWindow[] {
  const dueAt = new Date(due);
  if (Number.isNaN(dueAt.getTime())) return [];
  const dueDate = toISODate(dueAt);
  const dueMinutes = dueAt.getHours() * 60 + dueAt.getMinutes();
  const start = from ?? toISODate(new Date());
  if (dueDate < start) return [];

  const effMap = buildEffectiveMap(declared, window);
  const byDayOrder = new Map<number, TimetableSlot[]>();
  for (const slot of timetable) {
    const list = byDayOrder.get(slot.day_order) ?? [];
    list.push(slot);
    byDayOrder.set(slot.day_order, list);
  }
  for (const list of byDayOrder.values()) {
    list.sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));
  }

  const out: PrepWindow[] = [];
  for (const date of Object.keys(effMap).sort()) {
    if (date < start || date > dueDate) continue;
    const dayOrder = effMap[date];
    const slots = byDayOrder.get(dayOrder) ?? [];

    for (let i = 0; i < slots.length - 1; i++) {
      const openAt = timeToMinutes(slots[i].end_time);
      const closeAt = timeToMinutes(slots[i + 1].start_time);
      const minutes = closeAt - openAt;
      if (minutes < minMinutes) continue;
      // A window you are already past, or one that opens after the
      // thing is due, is not somewhere to prepare.
      if (date === start && openAt < fromMinutes) continue;
      if (date === dueDate && closeAt > dueMinutes) continue;

      out.push({
        date,
        dayOrder,
        start: slots[i].end_time.slice(0, 5),
        end: slots[i + 1].start_time.slice(0, 5),
        minutes,
        afterSubjectId: slots[i].subject_id,
        beforeSubjectId: slots[i + 1].subject_id,
      });
    }
  }
  return out;
}

/** "1h 15m" - the same shape `formatGap` gives a countdown. */
export function formatPrep(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
