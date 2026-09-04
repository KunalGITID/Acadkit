/**
 * Deciding when spending a free day is worth mentioning.
 *
 * The survival card is a snapshot: marking one class absent can turn a
 * day you could have taken off into one you can't, and nothing said so.
 * You'd find out by going back and noticing the list had changed, which
 * is exactly the kind of thing nobody notices.
 *
 * The interesting part is not the subtraction, it's the three reasons to
 * stay quiet — so it lives here as a pure function rather than inside the
 * effect that shows the toast.
 */

/** A free-day count and the date it was taken on. */
export interface FreeDayMark {
  count: number;
  date: string;
}

/** How many free days were just lost, or null for "say nothing". */
export function freeDayLoss(before: FreeDayMark | null, now: FreeDayMark): number | null {
  // Nothing to have changed from.
  if (!before) return null;
  // Free days also disappear the ordinary way — the day arrives and
  // passes. Across a date boundary the baseline is stale, and comparing
  // to it would announce a theft every morning.
  if (before.date !== now.date) return null;
  // Marking a class present can hand a day back. Not worth interrupting.
  if (now.count >= before.count) return null;
  return before.count - now.count;
}
