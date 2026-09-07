import { isCounted } from "@/lib/attendance";
import { timeToMinutes } from "@/lib/dates";
import type { AttendanceStatus, Subject, TimetableSlot } from "@/types";

/**
 * Where you are in the day, right now.
 *
 * The app knows your timetable and it knows the time, but until this it
 * never put the two together — the dashboard read the same at 8am as it
 * did at 8pm. Everything here is derived from one integer (minutes since
 * midnight) so it can be tested without mocking a clock.
 *
 * The states are deliberately few. "Which class am I in, and how long is
 * left" is the whole question; anything more is a timetable, which is a
 * page away.
 */

export interface LiveSlot {
  slot: TimetableSlot;
  subject: Subject | undefined;
}

export type LiveState =
  /** Before the first class of the day. */
  | { kind: "before"; next: LiveSlot; minutesUntil: number }
  /** Inside a class. */
  | { kind: "in"; current: LiveSlot; minutesLeft: number; minutesElapsed: number; next: LiveSlot | null }
  /** Between two classes. */
  | { kind: "gap"; next: LiveSlot; minutesUntil: number; previous: LiveSlot }
  /** Every class has ended. */
  | { kind: "done"; last: LiveSlot }
  /** Nothing scheduled — a holiday, a weekend, or an empty day order. */
  | { kind: "none" };

/**
 * The classes that are still going to happen.
 *
 * A cancelled class is not a class. Without this the day rolls on as
 * though it were: the card announced "next: Transforms, 32 min of
 * freedom" for a slot the same screen was showing with a cancelled
 * mark two rows below, and the countdown ran down to a room nobody was
 * going to.
 *
 * A slot with no record yet is still scheduled — most of the day is in
 * that state — and `isCounted` is the one place that knows "holiday" is
 * the stored word for cancelled.
 */
export function stillScheduled(
  slots: LiveSlot[],
  statusFor: (slot: LiveSlot) => AttendanceStatus | null
): LiveSlot[] {
  return slots.filter((s) => {
    const status = statusFor(s);
    return status === null || isCounted(status);
  });
}

/**
 * Whether today has nothing left to happen.
 *
 * Not "has every slot ended" — that counts a cancelled 4pm class as
 * still to come and pins the dashboard to a finished day until the hour
 * it was never going to run in. What matters is whether anything still
 * scheduled is still ahead of you.
 *
 * A day with no classes at all is not "over": a Sunday should say
 * weekend, not show you Monday. A day whose classes were all cancelled
 * is over, because nothing is going to happen in it.
 */
export function dayIsOver(
  slots: LiveSlot[],
  nowMinutes: number,
  statusFor: (slot: LiveSlot) => AttendanceStatus | null
): boolean {
  if (slots.length === 0) return false;
  return stillScheduled(slots, statusFor).every(
    (s) => nowMinutes > timeToMinutes(s.slot.end_time)
  );
}

/**
 * A class counts as "now" from its start up to *but not including* its
 * end minute, so a 08:00–08:50 followed by 08:50–09:40 hands over cleanly
 * at 08:50 instead of both matching for a minute.
 */
export function liveState(slots: LiveSlot[], nowMinutes: number): LiveState {
  if (!slots.length) return { kind: "none" };

  const ordered = [...slots].sort(
    (a, b) => timeToMinutes(a.slot.start_time) - timeToMinutes(b.slot.start_time)
  );

  for (let i = 0; i < ordered.length; i++) {
    const entry = ordered[i];
    const start = timeToMinutes(entry.slot.start_time);
    const end = timeToMinutes(entry.slot.end_time);

    if (nowMinutes < start) {
      const previous = i > 0 ? ordered[i - 1] : null;
      const minutesUntil = start - nowMinutes;
      return previous
        ? { kind: "gap", next: entry, minutesUntil, previous }
        : { kind: "before", next: entry, minutesUntil };
    }

    if (nowMinutes < end) {
      return {
        kind: "in",
        current: entry,
        minutesLeft: end - nowMinutes,
        minutesElapsed: nowMinutes - start,
        next: ordered[i + 1] ?? null,
      };
    }
  }

  return { kind: "done", last: ordered[ordered.length - 1] };
}

/**
 * "12 min", "1h 20m" — short enough to sit next to a subject name.
 *
 * Rounds nothing away: 90 minutes reads "1h 30m", not "2h", because the
 * number is being used to decide whether to leave for class.
 */
export function formatGap(minutes: number): string {
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** How far through the current class you are, 0–1, for a progress bar. */
export function classProgress(state: LiveState): number {
  if (state.kind !== "in") return 0;
  const total = state.minutesElapsed + state.minutesLeft;
  return total > 0 ? state.minutesElapsed / total : 0;
}
