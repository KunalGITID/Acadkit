import { buildEffectiveMap, semesterWindow, type SemesterWindow } from "@/lib/calendar";
import type { DeclaredHoliday, PortalSnapshot, Subject, TimetableSlot } from "@/types";

/**
 * Whether your timetable matches the one you're actually attending.
 *
 * Everything forward-looking in this app is counted off the timetable:
 * classes remaining, the skip budget, the recovery date, the survival
 * plan. A missing slot doesn't announce itself — it makes every one of
 * those numbers quietly optimistic, and the app keeps saying them with
 * a straight face.
 *
 * There is a second opinion available, and it has been sitting in the
 * database the whole time. The portal reports how many hours were
 * *conducted*, which is ground truth about what was scheduled; the
 * timetable plus the day-order calendar says how many should have been.
 * When those disagree by more than the ordinary noise, the timetable is
 * the likely culprit — and unlike a wrong percentage, this points at
 * the cause instead of the symptom.
 *
 * It is deliberately a suspicion, not a verdict. Cancellations, extra
 * classes, a lab the portal counts as two hours where you entered one
 * slot, a faculty member who marks late — all of them move this number
 * without anything being wrong. So the tolerance is wide, the wording
 * hedges, and the one case stated plainly is the unambiguous one: a
 * subject the portal is conducting that your timetable never schedules
 * at all.
 */

export type SlotVerdict =
  | "ok" // near enough
  | "missing" // portal conducted more than the timetable schedules
  | "extra" // the timetable schedules more than the portal conducts
  | "absent" // not on the timetable at all, yet classes are being held
  | "unsure"; // too early, or nothing to compare against

export interface SlotAudit {
  subject: Subject;
  /** Hours the portal says were conducted, as of its own date. */
  conducted: number;
  /** Hours the timetable and calendar imply over the same window. */
  implied: number;
  gap: number;
  /** Day-order cycles covered — roughly weeks. */
  cycles: number;
  /** The gap spread over those cycles, to the nearest half class. */
  perCycle: number;
  verdict: SlotVerdict;
  /** The portal's own as-of date, so the comparison can be dated. */
  asOf: string;
}

/** The rotation length; a cycle is what a "week" means on a day order. */
const CYCLE = 5;

/**
 * How far apart the two counts can be before it means anything.
 *
 * Two classes, or 8% — whichever is larger. A term's worth of ordinary
 * churn (a cancelled hour here, a makeup there) lands inside this; a
 * whole weekly slot missing does not.
 */
function tolerance(conducted: number): number {
  return Math.max(2, Math.round(conducted * 0.08));
}

function roundHalf(n: number): number {
  return Math.round(n * 2) / 2;
}

/** Classes of one subject the timetable implies between two dates. */
function impliedClasses(
  subjectId: string,
  timetable: TimetableSlot[],
  effMap: Record<string, number>,
  from: string,
  to: string
): { classes: number; workingDays: number } {
  const perDayOrder = new Map<number, number>();
  for (const s of timetable) {
    if (s.subject_id !== subjectId) continue;
    perDayOrder.set(s.day_order, (perDayOrder.get(s.day_order) ?? 0) + 1);
  }
  let classes = 0;
  let workingDays = 0;
  for (const date of Object.keys(effMap)) {
    if (date < from || date > to) continue;
    workingDays++;
    classes += perDayOrder.get(effMap[date]) ?? 0;
  }
  return { classes, workingDays };
}

export interface AuditInput {
  subjects: Subject[];
  timetable: TimetableSlot[];
  snapshots: PortalSnapshot[];
  declared?: DeclaredHoliday[];
  window?: SemesterWindow;
}

/**
 * One audit per subject the portal has reported on, worst first.
 *
 * Subjects with no snapshot are left out entirely rather than reported
 * as "unsure": there is no second opinion to compare against, and a
 * list of shrugs is noise on a screen that only earns its place by
 * being specific.
 */
export function auditTimetable({
  subjects,
  timetable,
  snapshots,
  declared = [],
  window = semesterWindow(),
}: AuditInput): SlotAudit[] {
  const effMap = buildEffectiveMap(declared, window);
  const byCode = new Map(subjects.map((s) => [s.code.trim().toUpperCase(), s]));

  const out: SlotAudit[] = [];
  for (const snap of snapshots) {
    const subject = byCode.get(snap.subject_code.trim().toUpperCase());
    if (!subject || snap.conducted <= 0) continue;

    // The portal's figure is as of its own date, so the timetable is
    // asked the same question over the same window. Comparing a
    // week-old total against a to-date projection would manufacture a
    // gap out of nothing but the delay.
    const to = snap.as_of < window.end ? snap.as_of : window.end;
    const { classes: implied, workingDays } = impliedClasses(
      subject.id,
      timetable,
      effMap,
      window.start,
      to
    );
    const cycles = workingDays / CYCLE;
    const gap = snap.conducted - implied;

    let verdict: SlotVerdict;
    if (implied === 0) verdict = "absent";
    else if (cycles < 1) verdict = "unsure";
    else if (Math.abs(gap) <= tolerance(snap.conducted)) verdict = "ok";
    else verdict = gap > 0 ? "missing" : "extra";

    out.push({
      subject,
      conducted: snap.conducted,
      implied,
      gap,
      cycles,
      perCycle: cycles > 0 ? roundHalf(gap / cycles) : 0,
      verdict,
      asOf: snap.as_of,
    });
  }

  const rank: Record<SlotVerdict, number> = { absent: 0, missing: 1, extra: 2, unsure: 3, ok: 4 };
  return out.sort(
    (a, b) => rank[a.verdict] - rank[b.verdict] || Math.abs(b.gap) - Math.abs(a.gap)
  );
}

/** The audits worth putting on screen. */
export function suspectAudits(audits: SlotAudit[]): SlotAudit[] {
  return audits.filter((a) => a.verdict === "absent" || a.verdict === "missing" || a.verdict === "extra");
}

/**
 * What to say about one subject.
 *
 * Names the fix where it can — "a weekly class missing" is actionable,
 * "the numbers disagree" is not — and stays a suspicion where it can't.
 */
export function describeAudit(audit: SlotAudit): string {
  const per = Math.abs(audit.perCycle);
  const classes = (n: number) => `${n} class${n === 1 ? "" : "es"}`;

  if (audit.verdict === "absent")
    return `The portal has conducted ${classes(audit.conducted)}, but this subject isn't on your timetable at all.`;
  if (audit.verdict === "missing")
    return per >= 0.75
      ? `The portal counts ${audit.gap} more than your timetable schedules — about ${per} a week. A slot is probably missing.`
      : `The portal counts ${audit.gap} more than your timetable schedules.`;
  if (audit.verdict === "extra")
    return per >= 0.75
      ? `Your timetable schedules ${-audit.gap} more than the portal has conducted — about ${per} a week. A slot may be wrong.`
      : `Your timetable schedules ${-audit.gap} more than the portal has conducted.`;
  return `Timetable and portal agree to within ${Math.abs(audit.gap)}.`;
}
