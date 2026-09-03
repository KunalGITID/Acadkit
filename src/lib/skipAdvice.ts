import type { SubjectProjection } from "@/lib/projections";
import type { Subject, TimetableSlot } from "@/types";

/**
 * "Can I skip tomorrow?" — the question the app is actually opened for.
 *
 * The projection engine already knows each subject's skip budget: how
 * many future classes can still be missed while finishing at or above
 * 75%. This turns that into a per-class verdict for one specific day.
 *
 * The detail that matters: a day with two classes of the same subject
 * spends two of that subject's budget, so budgets are consumed as the
 * day is walked rather than checked independently. Skipping a whole day
 * is one decision, not N.
 */

export interface SkipClassVerdict {
  subject: Subject;
  slot: TimetableSlot;
  /** Safe to miss this one and still finish ≥ 75%. */
  safe: boolean;
  /** Skip budget left for this subject after missing this class. */
  budgetAfter: number;
  /** Where the subject lands if this is missed and everything else attended. */
  pctAfter: number | null;
}

export interface SkipAdvice {
  date: string;
  classes: SkipClassVerdict[];
  /** Every class that day is safe to miss. */
  allSafe: boolean;
  /** Subjects that would drop below 75% if the whole day is skipped. */
  costly: Subject[];
  headline: string;
}

/** Percentage if `missed` more classes are missed and the rest attended. */
function pctAfterMissing(p: SubjectProjection, missed: number): number | null {
  if (p.finalTotal <= 0) return null;
  const attended = p.attended + Math.max(0, p.remaining - missed);
  return (attended / p.finalTotal) * 100;
}

export function skipAdviceFor(
  date: string,
  dayOrder: number | null,
  timetable: TimetableSlot[],
  perSubject: SubjectProjection[]
): SkipAdvice {
  const empty: SkipAdvice = {
    date,
    classes: [],
    allSafe: true,
    costly: [],
    headline: "No classes scheduled — nothing to skip.",
  };
  if (dayOrder === null) return empty;

  const bySubject = new Map(perSubject.map((p) => [p.subject.id, p]));
  const slots = timetable
    .filter((s) => s.day_order === dayOrder)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
  if (!slots.length) return empty;

  // How many of this day's classes we've already counted per subject.
  const spent = new Map<string, number>();
  const classes: SkipClassVerdict[] = [];

  for (const slot of slots) {
    const p = bySubject.get(slot.subject_id);
    if (!p) continue;
    const used = (spent.get(slot.subject_id) ?? 0) + 1;
    spent.set(slot.subject_id, used);

    const budgetAfter = p.skipBudget - used;
    classes.push({
      subject: p.subject,
      slot,
      safe: budgetAfter >= 0,
      budgetAfter,
      pctAfter: pctAfterMissing(p, used),
    });
  }

  if (!classes.length) return empty;

  const costly = classes.filter((c) => !c.safe).map((c) => c.subject);
  const uniqueCostly = costly.filter(
    (s, i) => costly.findIndex((o) => o.id === s.id) === i
  );
  const allSafe = uniqueCostly.length === 0;

  return {
    date,
    classes,
    allSafe,
    costly: uniqueCostly,
    headline: allSafe
      ? `Safe to skip all ${classes.length} class${classes.length > 1 ? "es" : ""}.`
      : `Skipping costs you ${uniqueCostly.map((s) => s.code).join(", ")}.`,
  };
}
