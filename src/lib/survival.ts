import type { Subject, TimetableSlot } from "@/types";

/**
 * The survival schedule.
 *
 * Every other view answers "how am I doing?" per subject. This answers
 * the question that actually changes tomorrow: **which specific days can
 * I still miss, and from when am I out of room?**
 *
 * The arithmetic per subject is the same everywhere in the app — to
 * finish at or above `MIN`, you need
 *
 *     attended + x >= MIN * (held + remaining)
 *
 * classes out of the `remaining` ones. What's new is where the slack
 * goes. Skips are spent on the **earliest** occurrences, deliberately:
 * that surfaces a date — the last day you can afford to miss — instead
 * of a budget you'd have to ration yourself. Rationing is the part
 * people get wrong.
 *
 * Subjects already past saving are not padded out. They keep every class
 * marked optional, because pretending attendance is mandatory for a
 * subject that cannot reach the threshold is a lie that costs you days
 * you could have spent on subjects that are still winnable.
 */

export const MIN = 0.75;

export interface SubjectState {
  subject: Subject;
  /** Classes attended so far. */
  attended: number;
  /** Classes held so far (present + absent; cancelled excluded). */
  held: number;
}

export interface PlannedClass {
  subject: Subject;
  slot: TimetableSlot;
  /** False when this class can be missed without losing the subject. */
  required: boolean;
}

export interface PlanDay {
  date: string;
  dayOrder: number;
  classes: PlannedClass[];
  /** No class that day is required — the whole day is free. */
  free: boolean;
  requiredCount: number;
}

export interface SubjectOutlook {
  subject: Subject;
  attended: number;
  held: number;
  remaining: number;
  /** How many of the remaining classes must be attended. */
  needed: number;
  /** Remaining classes you can still miss. Never negative. */
  slack: number;
  /** False when even attending everything left falls short of MIN. */
  reachable: boolean;
  /** Percentage if every remaining class is attended. */
  ceiling: number;
  /**
   * Last date you can miss this subject. Null when there is no slack, or
   * when the subject is unreachable and the question is moot.
   */
  lastSkippable: string | null;
}

export interface SurvivalPlan {
  days: PlanDay[];
  subjects: SubjectOutlook[];
  /** Days with nothing required — the ones you can actually take off. */
  freeDays: string[];
  /**
   * First date carrying a required class. From here on, missing costs
   * you a subject. Null when nothing is required at all.
   */
  firstRequiredDate: string | null;
  /** Subjects that can no longer reach MIN however hard you try. */
  lost: Subject[];
}

/** Classes needed out of `remaining` to finish at or above MIN. */
export function classesNeeded(attended: number, held: number, remaining: number): number {
  const target = MIN * (held + remaining);
  return Math.max(0, Math.ceil(target - attended));
}

export function buildSurvivalPlan(
  states: SubjectState[],
  timetable: TimetableSlot[],
  effMap: Record<string, number>,
  from: string
): SurvivalPlan {
  const slotsByDayOrder = new Map<number, TimetableSlot[]>();
  for (const slot of timetable) {
    const list = slotsByDayOrder.get(slot.day_order) ?? [];
    list.push(slot);
    slotsByDayOrder.set(slot.day_order, list);
  }

  const dates = Object.keys(effMap)
    .filter((d) => d >= from)
    .sort();

  // Future occurrences per subject, in order — the order is what lets
  // slack be spent earliest-first below.
  const upcoming = new Map<string, Array<{ date: string; slot: TimetableSlot }>>();
  for (const date of dates) {
    const slots = [...(slotsByDayOrder.get(effMap[date]) ?? [])].sort((a, b) =>
      a.start_time.localeCompare(b.start_time)
    );
    for (const slot of slots) {
      const list = upcoming.get(slot.subject_id) ?? [];
      list.push({ date, slot });
      upcoming.set(slot.subject_id, list);
    }
  }

  const outlooks: SubjectOutlook[] = [];
  /** `subject|date|start_time` for every class that may be missed. */
  const optional = new Set<string>();

  for (const { subject, attended, held } of states) {
    const occurrences = upcoming.get(subject.id) ?? [];
    const remaining = occurrences.length;
    const needed = classesNeeded(attended, held, remaining);
    const reachable = needed <= remaining;
    const slack = reachable ? remaining - needed : remaining;
    const ceiling =
      held + remaining > 0 ? ((attended + remaining) / (held + remaining)) * 100 : 0;

    // Spend slack on the earliest classes, so what falls out is a date
    // rather than a budget. An unreachable subject has every class
    // optional — see the note at the top.
    const spend = occurrences.slice(0, slack);
    for (const { date, slot } of spend) {
      optional.add(`${subject.id}|${date}|${slot.start_time}`);
    }

    outlooks.push({
      subject,
      attended,
      held,
      remaining,
      needed,
      slack,
      reachable,
      ceiling,
      lastSkippable: reachable && spend.length ? spend[spend.length - 1].date : null,
    });
  }

  const days: PlanDay[] = [];
  for (const date of dates) {
    const slots = [...(slotsByDayOrder.get(effMap[date]) ?? [])].sort((a, b) =>
      a.start_time.localeCompare(b.start_time)
    );
    const classes: PlannedClass[] = [];
    for (const slot of slots) {
      const outlook = outlooks.find((o) => o.subject.id === slot.subject_id);
      if (!outlook) continue;
      classes.push({
        subject: outlook.subject,
        slot,
        required: !optional.has(`${slot.subject_id}|${date}|${slot.start_time}`),
      });
    }
    if (!classes.length) continue;
    const requiredCount = classes.filter((c) => c.required).length;
    days.push({
      date,
      dayOrder: effMap[date],
      classes,
      requiredCount,
      free: requiredCount === 0,
    });
  }

  return {
    days,
    subjects: outlooks,
    freeDays: days.filter((d) => d.free).map((d) => d.date),
    firstRequiredDate: days.find((d) => !d.free)?.date ?? null,
    lost: outlooks.filter((o) => !o.reachable).map((o) => o.subject),
  };
}
