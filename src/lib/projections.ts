/**
 * Forward-looking projection engine.
 *
 * Unlike a generic "current %", this uses the day-order calendar + your
 * timetable to count the *exact* remaining real classes for every
 * subject until the semester ends, then derives skip budgets, recovery
 * needs, end-of-term projections, risk and what-if scenarios from that.
 */
import { isAttended, isCounted } from "@/lib/attendance";
import type { AttendanceRecord, DeclaredHoliday, Mark, Subject, TimetableSlot } from "@/types";
import { buildEffectiveMap, semesterWindow, type SemesterWindow } from "@/lib/calendar";
import { parseISODate, todayISO } from "@/lib/dates";
import { gradeForTotal, groupMarksBySubject, type Grade } from "@/lib/grades";
import { gradeForTargetSgpa, solveSubjectPlan, type SubjectPlan } from "@/lib/plan";

export const MIN = 0.75;

export type RiskLevel = "safe" | "watch" | "critical";

export interface SubjectProjection {
  subject: Subject;
  // locked-in so far
  attended: number;
  held: number; // present + absent
  currentPct: number | null;
  // future (from the calendar)
  remaining: number;
  finalTotal: number; // held + remaining
  // scenarios
  bestPct: number; // attend every remaining class
  worstPct: number; // skip every remaining class
  pacePct: number | null; // keep your current attend-rate
  // actionable
  skipBudget: number; // future classes you can still miss and end ≥ 75%
  mustAttendStreak: number; // if below: consecutive future classes to climb back
  recoveryDate: string | null; // date of the class that closes mustAttendStreak, if below 75%
  reachable: boolean; // can you still end ≥ 75%?
  safeUntil: string | null; // last date you could skip everything until
  riskLevel: RiskLevel;
  riskScore: number; // 0 (safe) – 100 (doomed)
}

export interface OverallProjection {
  attended: number;
  held: number;
  remaining: number;
  currentPct: number | null;
  bestPct: number;
  worstPct: number;
  pacePct: number | null;
  skipBudget: number;
}

interface FutureOccurrence {
  date: string;
  slot: TimetableSlot;
}

/** Every scheduled class of a subject on/after today that isn't marked yet, in date order. */
function futureOccurrences(
  subjectId: string,
  timetable: TimetableSlot[],
  effMap: Record<string, number>,
  markedKeys: Set<string>,
  from: string,
  semEnd: string
): FutureOccurrence[] {
  const slotsByDayOrder = new Map<number, TimetableSlot[]>();
  for (const s of timetable) {
    if (s.subject_id !== subjectId) continue;
    const list = slotsByDayOrder.get(s.day_order) ?? [];
    list.push(s);
    slotsByDayOrder.set(s.day_order, list);
  }
  const out: FutureOccurrence[] = [];
  const dates = Object.keys(effMap)
    .filter((d) => d >= from && d <= semEnd)
    .sort();
  for (const date of dates) {
    const slots = slotsByDayOrder.get(effMap[date]) ?? [];
    for (const slot of slots) {
      if (!markedKeys.has(`${subjectId}|${date}|${slot.start_time}`)) out.push({ date, slot });
    }
  }
  return out;
}

function riskFrom(
  currentPct: number | null,
  pacePct: number | null,
  bestPct: number,
  skipBudget: number
): { level: RiskLevel; score: number } {
  if (bestPct < 75) return { level: "critical", score: 100 };
  const ref = pacePct ?? currentPct;
  if (ref === null) return { level: "safe", score: 10 };
  if (ref >= 75 && skipBudget >= 2) return { level: "safe", score: Math.max(0, Math.round(40 - (ref - 75) * 2)) };
  if (ref >= 75) return { level: "watch", score: 55 };
  // below 75 at current pace but still reachable
  return { level: "watch", score: Math.min(95, Math.round(60 + (75 - ref) * 2)) };
}

export function projectSubject(
  subject: Subject,
  records: AttendanceRecord[],
  timetable: TimetableSlot[],
  effMap: Record<string, number>,
  from: string,
  semEnd: string = semesterWindow().end
): SubjectProjection {
  const counted = records.filter((r) => isCounted(r.status));
  const attended = counted.filter((r) => isAttended(r.status)).length;
  const held = counted.length;
  const currentPct = held > 0 ? (attended / held) * 100 : null;

  const markedKeys = new Set(records.map((r) => `${r.subject_id}|${r.date}|${r.start_time}`));
  const future = futureOccurrences(subject.id, timetable, effMap, markedKeys, from, semEnd);
  const remaining = future.length;
  const finalTotal = held + remaining;

  const bestPct = finalTotal > 0 ? ((attended + remaining) / finalTotal) * 100 : 0;
  const worstPct = finalTotal > 0 ? (attended / finalTotal) * 100 : 0;
  const rate = held > 0 ? attended / held : null;
  const pacePct =
    rate !== null && finalTotal > 0 ? ((attended + rate * remaining) / finalTotal) * 100 : null;

  // S future skips keep you ≥75%:  (attended + remaining − S)/finalTotal ≥ 0.75
  const skipBudget = Math.max(0, Math.floor(attended + remaining - MIN * finalTotal));

  // If below: smallest streak K of future attends so (attended+K)/(held+K) ≥ 0.75
  let mustAttendStreak = 0;
  if (currentPct !== null && currentPct < 75) {
    mustAttendStreak = Math.max(0, Math.ceil((MIN * held - attended) / (1 - MIN)));
  }
  const reachable = bestPct >= 75 - 1e-9;

  // The date of the mustAttendStreak-th future class — attend every class up to and
  // including this date and the subject crosses back over 75%.
  const recoveryDate =
    mustAttendStreak > 0 && future[mustAttendStreak - 1] ? future[mustAttendStreak - 1].date : null;

  // Last date you could skip everything from now and still end ≥75%
  let safeUntil: string | null = null;
  if (skipBudget > 0 && future[skipBudget - 1]) safeUntil = future[skipBudget - 1].date;

  const { level, score } = riskFrom(currentPct, pacePct, bestPct, skipBudget);

  return {
    subject,
    attended,
    held,
    currentPct,
    remaining,
    finalTotal,
    bestPct,
    worstPct,
    pacePct,
    skipBudget,
    mustAttendStreak,
    recoveryDate,
    reachable,
    safeUntil,
    riskLevel: level,
    riskScore: score,
  };
}

export interface AttendancePatterns {
  mostSkippedSubject: { subject: Subject; absents: number } | null;
  mostSkippedDayOrder: { dayOrder: number; absents: number } | null;
  trend: "improving" | "declining" | "steady" | "insufficient";
}

function patterns(
  subjects: Subject[],
  records: AttendanceRecord[],
  effMap: Record<string, number>
): AttendancePatterns {
  const counted = records.filter((r) => isCounted(r.status));
  const absents = counted.filter((r) => r.status === "absent");

  const bySubject = new Map<string, number>();
  for (const r of absents) bySubject.set(r.subject_id, (bySubject.get(r.subject_id) ?? 0) + 1);
  let mostSkippedSubject: AttendancePatterns["mostSkippedSubject"] = null;
  for (const [sid, n] of bySubject) {
    const subject = subjects.find((s) => s.id === sid);
    if (subject && (!mostSkippedSubject || n > mostSkippedSubject.absents))
      mostSkippedSubject = { subject, absents: n };
  }

  const byDayOrder = new Map<number, number>();
  for (const r of absents) {
    const dayOrder = effMap[r.date];
    if (dayOrder) byDayOrder.set(dayOrder, (byDayOrder.get(dayOrder) ?? 0) + 1);
  }
  let mostSkippedDayOrder: AttendancePatterns["mostSkippedDayOrder"] = null;
  for (const [d, n] of byDayOrder)
    if (!mostSkippedDayOrder || n > mostSkippedDayOrder.absents)
      mostSkippedDayOrder = { dayOrder: d, absents: n };

  return {
    mostSkippedSubject,
    mostSkippedDayOrder,
    trend: attendanceTrend(counted),
  };
}

/** Minimum marked classes before the halves mean anything. */
const TREND_MIN_RECORDS = 6;
/** Rate change that counts as a direction rather than noise. */
const TREND_BAND = 0.08;

/**
 * Which way attendance is heading: the later half of the record against
 * the earlier half.
 *
 * Exported because it needs to be said somewhere you actually look. It
 * lived inside the patterns block, which renders on the Insights tab —
 * two taps from anywhere — and "you're sliding" is the one fact here
 * that changes behaviour on the day you read it.
 *
 * The band exists so a single class can't flip the verdict. Below the
 * minimum it says "insufficient" rather than guessing a direction from
 * four data points.
 */
export function attendanceTrend(records: AttendanceRecord[]): AttendancePatterns["trend"] {
  const counted = records.filter((r) => isCounted(r.status));
  if (counted.length < TREND_MIN_RECORDS) return "insufficient";

  const sorted = [...counted].sort((a, b) => a.date.localeCompare(b.date));
  const mid = Math.floor(sorted.length / 2);
  const rate = (arr: AttendanceRecord[]) =>
    arr.filter((r) => isAttended(r.status)).length / arr.length;
  const delta = rate(sorted.slice(mid)) - rate(sorted.slice(0, mid));

  if (delta > TREND_BAND) return "improving";
  if (delta < -TREND_BAND) return "declining";
  return "steady";
}

export interface WhatIfRow {
  subject: Subject;
  /** Final % if you skip every remaining class of this subject from now. */
  ifSkipAll: number;
  /** Final % if you attend every remaining class. */
  ifAttendAll: number;
}

export interface ProjectionReport {
  date: string;
  perSubject: SubjectProjection[];
  overall: OverallProjection;
  patterns: AttendancePatterns;
  whatIf: WhatIfRow[];
  atRisk: SubjectProjection[]; // not safe, sorted worst-first
  // marks side
  /** Every subject, including ones with no marks yet — they still have a budget. */
  gradeProjections: SubjectGradeProjection[];
  /** The target SGPA these were solved against. */
  targetSgpa: number;
  predictedSgpa: number | null;
  ceilingSgpa: number | null; // if you ace every remaining end-sem
  floorSgpa: number | null; // if every end-sem is blank
  gradesAtRisk: SubjectGradeProjection[];
}

/**
 * A subject's grade outlook, entirely budget-derived.
 *
 * Everything here reads off `plan` (src/lib/plan.ts) rather than the
 * old earned-over-entered ratio, so a subject with one 5/5 assignment
 * reports 5 marks banked of 100 with 95 unplayed — not "100%, on pace
 * for O". The fields kept their names because the SGPA maths above and
 * `sgpaTarget.ts` read them, but every one of them now means "of the
 * whole course" rather than "of what happens to be marked".
 */
export interface SubjectGradeProjection {
  subject: Subject;
  /** The full solve against this subject's target grade. */
  plan: SubjectPlan;
  targetGrade: Grade;
  internalOnly: boolean;
  /** Internal weight, 0–100. 60 unless the subject says otherwise. */
  internalWeight: number;
  /** /100 banked so far — the floor, not a projection. */
  banked: number;
  /** /100 still to play for. */
  pool: number;
  /** Share of what's left the target needs, 0–1. Null when nothing is left. */
  requiredRate: number | null;
  /** Share of what's been played that you've actually taken, 0–1. */
  paceRate: number | null;
  /** /100 if you keep scoring at your rate so far. */
  predictedTotal: number;
  predictedGrade: Grade;
  predictedPoints: number;
  /** Ace everything left. */
  bestTotal: number;
  bestGrade: Grade;
  /** Score zero on everything left. */
  worstTotal: number;
  worstGrade: Grade;
  /** Best grade still arithmetically reachable. */
  bestReachable: Grade | null;
  /** The next grade up from predicted that is still reachable. */
  nextGrade: { grade: Grade; points: number; rate: number } | null;
  riskLevel: RiskLevel;
}

function gradeRisk(grade: Grade): RiskLevel {
  if (grade === "F") return "critical";
  if (grade === "C" || grade === "B") return "watch";
  return "safe";
}

function projectSubjectGrade(
  subject: Subject,
  marks: Mark[],
  targetSgpa: number
): SubjectGradeProjection {
  const targetGrade = subject.target_grade ?? gradeForTargetSgpa(targetSgpa);
  const plan = solveSubjectPlan(subject, marks, targetGrade);

  // The pace read: keep taking the same share of every mark you have so
  // far. With nothing graded there is no rate to extend, so the honest
  // prediction is the floor — you have banked nothing.
  const predictedTotal = plan.pace ?? plan.banked;
  const pg = gradeForTotal(predictedTotal);

  // One grade up, and only if the arithmetic still allows it.
  const nextGrade =
    plan.perGrade
      .filter((g) => g.points > pg.points && g.achievable && g.rate !== null)
      .sort((a, b) => a.points - b.points)
      .map((g) => ({ grade: g.grade, points: g.points, rate: g.rate! }))[0] ?? null;

  // A target that is gone is the loudest thing this card can say, so it
  // outranks the grade-band colouring.
  const riskLevel: RiskLevel =
    plan.status === "out-of-reach" ? "critical" : plan.status === "push" ? "watch" : gradeRisk(pg.grade);

  return {
    subject,
    plan,
    targetGrade,
    internalOnly: plan.externalWeight <= 0,
    internalWeight: plan.internalWeight,
    banked: plan.banked,
    pool: plan.pool,
    requiredRate: plan.requiredRate,
    paceRate: plan.paceRate,
    predictedTotal,
    predictedGrade: pg.grade,
    predictedPoints: pg.points,
    bestTotal: plan.ceiling,
    bestGrade: plan.ceilingGrade,
    worstTotal: plan.floor,
    worstGrade: plan.floorGrade,
    bestReachable: plan.bestReachable,
    nextGrade,
    riskLevel,
  };
}

function sgpaFrom(
  rows: SubjectGradeProjection[],
  pick: (p: SubjectGradeProjection) => number
): number | null {
  const credit = rows.filter((p) => p.subject.credits > 0);
  const cr = credit.reduce((a, p) => a + p.subject.credits, 0);
  if (cr === 0) return null;
  return credit.reduce((a, p) => a + pick(p) * p.subject.credits, 0) / cr;
}

export function buildProjection(
  subjects: Subject[],
  attendance: AttendanceRecord[],
  timetable: TimetableSlot[],
  marks: Mark[],
  declared: DeclaredHoliday[],
  fromDate: string = todayISO(),
  window: SemesterWindow = semesterWindow(),
  targetSgpa = 8.5
): ProjectionReport {
  const effMap = buildEffectiveMap(declared, window);
  const from = fromDate > window.end ? window.end : fromDate;

  const recordsBySubject = new Map<string, AttendanceRecord[]>();
  for (const r of attendance) {
    const list = recordsBySubject.get(r.subject_id) ?? [];
    list.push(r);
    recordsBySubject.set(r.subject_id, list);
  }

  const perSubject = subjects.map((s) =>
    projectSubject(s, recordsBySubject.get(s.id) ?? [], timetable, effMap, from, window.end)
  );

  const sum = (f: (p: SubjectProjection) => number) => perSubject.reduce((a, p) => a + f(p), 0);
  const oAttended = sum((p) => p.attended);
  const oHeld = sum((p) => p.held);
  const oRemaining = sum((p) => p.remaining);
  const oFinal = oHeld + oRemaining;
  const oRate = oHeld > 0 ? oAttended / oHeld : null;
  const overall: OverallProjection = {
    attended: oAttended,
    held: oHeld,
    remaining: oRemaining,
    currentPct: oHeld > 0 ? (oAttended / oHeld) * 100 : null,
    bestPct: oFinal > 0 ? ((oAttended + oRemaining) / oFinal) * 100 : 0,
    worstPct: oFinal > 0 ? (oAttended / oFinal) * 100 : 0,
    pacePct: oRate !== null && oFinal > 0 ? ((oAttended + oRate * oRemaining) / oFinal) * 100 : null,
    skipBudget: Math.max(0, Math.floor(oAttended + oRemaining - MIN * oFinal)),
  };

  const whatIf: WhatIfRow[] = perSubject
    .filter((p) => p.remaining > 0)
    .map((p) => ({ subject: p.subject, ifSkipAll: p.worstPct, ifAttendAll: p.bestPct }));

  const atRisk = perSubject
    .filter((p) => p.riskLevel !== "safe" && (p.held > 0 || p.remaining > 0))
    .sort((a, b) => b.riskScore - a.riskScore);

  // Grade projections: internal locked at current pace, end-sem (/40) the
  // variable. Mirrors the attendance best/pace/worst structure.
  // Every subject gets solved, not just the ones with marks: a subject
  // with nothing entered still has a budget worth showing ("you need
  // 71% of everything from here"), which is exactly the state you're in
  // in week one.
  const marksBySubject = groupMarksBySubject(marks);
  const gradeProjections = subjects.map((s) =>
    projectSubjectGrade(s, marksBySubject.get(s.id) ?? [], targetSgpa)
  );

  // SGPA still only counts subjects with something to project from —
  // averaging in a subject that has banked nothing yet would drag the
  // number toward zero and say nothing true.
  const scoreable = gradeProjections.filter((p) => p.plan.hasAnyMarks);
  const predictedSgpa = sgpaFrom(scoreable, (p) => p.predictedPoints);
  const ceilingSgpa = sgpaFrom(scoreable, (p) => gradeForTotal(p.bestTotal).points);
  const floorSgpa = sgpaFrom(scoreable, (p) => gradeForTotal(p.worstTotal).points);
  const gradesAtRisk = gradeProjections
    .filter((p) => p.riskLevel !== "safe" && (p.plan.hasAnyMarks || p.plan.status === "out-of-reach"))
    .sort((a, b) => a.predictedPoints - b.predictedPoints);

  return {
    date: from,
    perSubject,
    overall,
    patterns: patterns(subjects, attendance, effMap),
    whatIf,
    atRisk,
    gradeProjections,
    targetSgpa,
    predictedSgpa,
    ceilingSgpa,
    floorSgpa,
    gradesAtRisk,
  };
}

/** Count of working class-days left in the semester (for headline copy). */
export function classDaysLeft(
  declared: DeclaredHoliday[],
  from: string = todayISO(),
  window: SemesterWindow = semesterWindow()
): number {
  const effMap = buildEffectiveMap(declared, window);
  return Object.keys(effMap).filter((d) => d >= from && d <= window.end).length;
}

export { parseISODate };
