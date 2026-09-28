import { timeToMinutes } from "@/lib/dates";
import type { DeadlineType, TimetableSlot } from "@/types";

/** When a deadline is actually due, guessed from the timetable. */

/** The fallback when the subject doesn't meet on that day. */
export const NO_CLASS_DUE_TIME = "08:00";

/** What a deadline with no period to anchor to keeps: end of the day. */
export const DEFAULT_DUE_TIME = "23:59";

/** How far apart two of the subject's classes can start and end and still be one sitting. */
const CONTIGUOUS_GAP = 10;

/** Which kind of period the suggestion came from. */
export type DueTimeAnchor =
  | "lab" // a lab period of the subject
  | "double" // two of the subject's periods back to back
  | "period" // a single period
  | "none"; // nothing that day - the 8:00 fallback

export interface DueTimeSuggestion {
  /** "HH:MM", ready for the time input. */
  time: string;
  anchor: DueTimeAnchor;
}

/** "09:00:00" and "09:00" both come back as "09:00". */
function hhmm(time: string): string {
  return time.slice(0, 5);
}

/** The subject's classes on that day order, earliest first. */
function daySlots(
  subjectId: string,
  dayOrder: number | null,
  timetable: TimetableSlot[]
): TimetableSlot[] {
  if (dayOrder === null) return [];
  return timetable
    .filter((s) => s.subject_id === subjectId && s.day_order === dayOrder)
    .sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));
}

/** Runs of the subject's periods that meet without a break between them. */
function blocks(slots: TimetableSlot[]): TimetableSlot[][] {
  const out: TimetableSlot[][] = [];
  for (const slot of slots) {
    const run = out[out.length - 1];
    const previous = run?.[run.length - 1];
    const adjacent =
      previous !== undefined &&
      timeToMinutes(slot.start_time) - timeToMinutes(previous.end_time) <= CONTIGUOUS_GAP;
    if (adjacent) run.push(slot);
    else out.push([slot]);
  }
  return out;
}

/** The period this deadline belongs in, or null if the day has none. */
function anchorFor(
  type: DeadlineType,
  slots: TimetableSlot[]
): { slot: TimetableSlot; anchor: DueTimeAnchor } | null {
  if (type === "lab") {
    // Strictly a lab: a theory period is not where a lab record is due.
    const lab = slots.find((s) => s.slot_type === "lab");
    return lab ? { slot: lab, anchor: "lab" } : null;
  }

  if (type === "exam") {
    const double = blocks(slots).find((run) => run.length >= 2);
    if (double) return { slot: double[0], anchor: "double" };
  }

  return slots.length > 0 ? { slot: slots[0], anchor: "period" } : null;
}

/**
 * The time to put in the field, or null when there's nothing to say -
 * no subject to look up, or a type ("other") that names no kind of
 * period. Null means "leave the existing default alone".
 */
export function suggestDueTime(
  type: DeadlineType,
  subjectId: string | null,
  dayOrder: number | null,
  timetable: TimetableSlot[]
): DueTimeSuggestion | null {
  if (type === "other" || !subjectId) return null;
  const found = anchorFor(type, daySlots(subjectId, dayOrder, timetable));
  return found
    ? { time: hhmm(found.slot.start_time), anchor: found.anchor }
    : { time: NO_CLASS_DUE_TIME, anchor: "none" };
}

/** One line saying where the time came from, so it isn't a mystery. */
export function describeDueTime(suggestion: DueTimeSuggestion): string {
  if (suggestion.anchor === "lab") return "Start of that day's lab period.";
  if (suggestion.anchor === "double") return "Start of that day's double period.";
  if (suggestion.anchor === "period") return "Start of that day's class.";
  return "No class that day - 8:00 AM.";
}
