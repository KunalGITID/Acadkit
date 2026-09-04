import type { TimetableSlot } from "@/types";

/**
 * "What happens to my percentage if I skip *these* days?"
 *
 * Insights already answers a related question — skip every remaining
 * class of one subject — but that is a worst case, not a plan. Nobody
 * writes off a subject; they consider missing next Thursday. This takes
 * a set of specific dates and returns the number they'd end the semester
 * on, which is the number the decision actually turns on.
 *
 * The baseline is *attend everything from here*, not today's percentage.
 * Comparing a plan against today's figure would credit the plan with all
 * the classes you're still going to sit through, and every skip would
 * look cheaper than it is.
 */

export interface ForecastDay {
  date: string;
  /** Classes scheduled that day. Zero-class days are still listed. */
  classes: number;
}

export interface Forecast {
  /** Percentage if you attend everything remaining. */
  baseline: number | null;
  /** Percentage if you also skip every selected day. */
  projected: number | null;
  /** projected − baseline, in points. Negative or zero. */
  delta: number;
  /** Classes given up by the current selection. */
  classesSkipped: number;
  /** Classes still to come, selected or not. */
  classesRemaining: number;
  /** True once the projection drops below the minimum. */
  belowMinimum: boolean;
}

/** How many classes each day order carries, from the timetable. */
export function classesPerDayOrder(timetable: TimetableSlot[] | undefined): Record<number, number> {
  const out: Record<number, number> = {};
  for (const slot of timetable ?? []) out[slot.day_order] = (out[slot.day_order] ?? 0) + 1;
  return out;
}

/**
 * The remaining working days, each with its class count.
 *
 * `effMap` is the semester's date → day-order map with declared holidays
 * already removed, so anything in it is a day that will actually happen.
 */
export function remainingDays(
  effMap: Record<string, number>,
  perDayOrder: Record<number, number>,
  today: string
): ForecastDay[] {
  return Object.keys(effMap)
    .filter((d) => d > today)
    .sort()
    .map((date) => ({ date, classes: perDayOrder[effMap[date]] ?? 0 }));
}

export function forecast(
  attended: number,
  total: number,
  days: ForecastDay[],
  skipped: ReadonlySet<string>,
  minimum = 75
): Forecast {
  const classesRemaining = days.reduce((n, d) => n + d.classes, 0);
  const classesSkipped = days
    .filter((d) => skipped.has(d.date))
    .reduce((n, d) => n + d.classes, 0);

  const finalTotal = total + classesRemaining;
  if (finalTotal === 0) {
    return {
      baseline: null,
      projected: null,
      delta: 0,
      classesSkipped: 0,
      classesRemaining: 0,
      belowMinimum: false,
    };
  }

  const baseline = ((attended + classesRemaining) / finalTotal) * 100;
  const projected = ((attended + classesRemaining - classesSkipped) / finalTotal) * 100;

  return {
    baseline,
    projected,
    delta: projected - baseline,
    classesSkipped,
    classesRemaining,
    belowMinimum: projected < minimum,
  };
}
