import { MIN } from "@/lib/projections";
import { computeOverallAttendance, MIN_ATTENDANCE, minAttendanceFor } from "@/lib/attendance";
import type { AttendanceRecord, PortalSnapshot, Subject, TimetableSlot } from "@/types";

/** The survival schedule. */

// One definition of the threshold, in projections.ts. Two constants
// that happen to agree are a coin-flip away from not agreeing.
export { MIN } from "@/lib/projections";

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
  /** No class that day is required - the whole day is free. */
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
  /** The bar this subject must clear - 65 on medical leave, else 75. */
  min: number;
  /** False when even attending everything left falls short of `min`. */
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
  /** Days with nothing required - the ones you can actually take off. */
  freeDays: string[];
  /**
   * First date carrying a required class. From here on, missing costs
   * you a subject. Null when nothing is required at all.
   */
  firstRequiredDate: string | null;
  /** Subjects that can no longer reach their bar however hard you try. */
  lost: Subject[];
  /** Subjects planned against a condoned bar rather than the usual one. */
  onMedicalLeave: Subject[];
}

/** Classes needed out of `remaining` to finish at or above the bar. */
export function classesNeeded(
  attended: number,
  held: number,
  remaining: number,
  min: number = MIN
): number {
  const target = min * (held + remaining);
  return Math.max(0, Math.ceil(target - attended));
}

/** `subject|date|start_time` - the natural key of an attendance row. */
const classKey = (subjectId: string, date: string, startTime: string) =>
  `${subjectId}|${date}|${startTime}`;

export function buildSurvivalPlan(
  states: SubjectState[],
  timetable: TimetableSlot[],
  effMap: Record<string, number>,
  from: string,
  /**
   * Classes that already have a record. They have happened (or were
   * cancelled), so they are not still to come: counting today's marked
   * classes as remaining put them in `held` and `remaining` at once.
   */
  marked: ReadonlySet<string> = new Set()
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

  // Future occurrences per subject, in order - the order is what lets
  // slack be spent earliest-first below.
  const upcoming = new Map<string, Array<{ date: string; slot: TimetableSlot }>>();
  for (const date of dates) {
    const slots = [...(slotsByDayOrder.get(effMap[date]) ?? [])].sort((a, b) =>
      a.start_time.localeCompare(b.start_time)
    );
    for (const slot of slots) {
      if (marked.has(classKey(slot.subject_id, date, slot.start_time))) continue;
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
    // Each subject against its own bar - a subject on medical leave is
    // planned to 65%, which is often the difference between a plan and
    // a write-off.
    const min = minAttendanceFor(subject);
    const needed = classesNeeded(attended, held, remaining, min / 100);
    const reachable = needed <= remaining;
    const slack = reachable ? remaining - needed : remaining;
    const ceiling =
      held + remaining > 0 ? ((attended + remaining) / (held + remaining)) * 100 : 0;

    // Spend slack on the earliest classes, so what falls out is a date
    // rather than a budget. An unreachable subject has every class
    // optional - see the note at the top.
    const spend = occurrences.slice(0, slack);
    for (const { date, slot } of spend) {
      optional.add(classKey(subject.id, date, slot.start_time));
    }

    outlooks.push({
      subject,
      attended,
      held,
      remaining,
      needed,
      slack,
      min,
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
      const key = classKey(slot.subject_id, date, slot.start_time);
      const outlook = outlooks.find((o) => o.subject.id === slot.subject_id);
      if (!outlook || marked.has(key)) continue;
      classes.push({
        subject: outlook.subject,
        slot,
        required: !optional.has(key),
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
    onMedicalLeave: outlooks
      .filter((o) => o.min !== MIN_ATTENDANCE)
      .map((o) => o.subject),
  };
}

/** The plan from the app's raw data - the one way every screen builds it. */
export function survivalPlanFrom(
  subjects: Subject[],
  attendance: AttendanceRecord[],
  snapshots: PortalSnapshot[],
  timetable: TimetableSlot[],
  effMap: Record<string, number>,
  from: string
): SurvivalPlan {
  const overall = computeOverallAttendance(subjects, attendance, snapshots);
  const states = overall.subjects.map((s) => ({
    subject: s.subject,
    attended: s.attended,
    held: s.total,
  }));
  const marked = new Set(attendance.map((r) => classKey(r.subject_id, r.date, r.start_time)));
  return buildSurvivalPlan(states, timetable, effMap, from, marked);
}
