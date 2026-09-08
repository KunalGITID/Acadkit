import { timeToMinutes } from "@/lib/dates";
import type { DeadlineType, TimetableSlot } from "@/types";

/**
 * When a deadline is actually due, guessed from the timetable.
 *
 * Almost nothing is due at 11:59pm. A lab record is due at the start of
 * the lab, an FT is written in the period it's scheduled in, an
 * assignment is handed over in the class that meets that day — so the
 * date you enter already implies the time, and typing it again is work
 * the app can do. Every answer here is a *default*: the field stays
 * editable and stops being touched the moment you change it.
 *
 * What counts as the right period differs by what the thing is, which
 * is why this takes the type:
 *
 *   lab         the subject's lab period on that day
 *   exam        a double period — two of the subject's classes back to
 *               back, which is what a test needs
 *   assignment  any single period of the subject
 *
 * With nothing to anchor to it falls back to 8:00am rather than to the
 * end of the day: a deadline you can't place is one to deal with before
 * classes start, not one to leave until midnight.
 */

/** The fallback when the subject doesn't meet on that day. */
export const NO_CLASS_DUE_TIME = "08:00";

/** What a deadline with no period to anchor to keeps: end of the day. */
export const DEFAULT_DUE_TIME = "23:59";

/**
 * How far apart two of the subject's classes can start and end and
 * still be one sitting.
 *
 * Periods are flush in the common case — 08:00–08:50 then 08:50–09:40 —
 * but a timetable typed by hand rounds: 09:00–09:50 followed by
 * 10:00–10:50 is the same double period written less exactly. Ten
 * minutes takes those and still refuses a real break.
 */
const CONTIGUOUS_GAP = 10;

/** Which kind of period the suggestion came from. */
export type DueTimeAnchor =
  | "lab" // a lab period of the subject
  | "double" // two of the subject's periods back to back
  | "period" // a single period
  | "none"; // nothing that day — the 8:00 fallback

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

/**
 * The period this deadline belongs in, or null if the day has none.
 *
 * An exam that finds no double period settles for a single one rather
 * than dropping all the way to 8:00: a subject that meets that day at
 * 10 is a better guess for when you'll sit its test than an hour it has
 * no classes in at all.
 */
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
 * The time to put in the field, or null when there's nothing to say —
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
  return "No class that day — 8:00 AM.";
}
