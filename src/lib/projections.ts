/**
 * Forward-looking projection engine.
 *
 * Unlike a generic "current %", this uses the day-order calendar + your
 * timetable to count the *exact* remaining real classes for every
 * subject until the semester ends, then derives skip budgets, recovery
 * needs, end-of-term projections, risk and what-if scenarios from that.
 */
import type { AttendanceRecord, DeclaredHoliday, Mark, Subject, TimetableSlot } from "@/types";
import { buildEffectiveMap, SEMESTER_END } from "@/lib/calendar";
import { parseISODate, todayISO } from "@/lib/dates";
import { computeSgpa, groupMarksBySubject, type Grade } from "@/lib/grades";

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
  from: string
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
    .filter((d) => d >= from && d <= SEMESTER_END)
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
  from: string
): SubjectProjection {
  const counted = records.filter((r) => r.status === "present" || r.status === "absent");
  const attended = counted.filter((r) => r.status === "present").length;
  const held = counted.length;
  const currentPct = held > 0 ? (attended / held) * 100 : null;

  const markedKeys = new Set(records.map((r) => `${r.subject_id}|${r.date}|${r.start_time}`));
  const future = futureOccurrences(subject.id, timetable, effMap, markedKeys, from);
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
  const counted = records.filter((r) => r.status === "present" || r.status === "absent");
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

  // Trend: compare attend-rate of the earlier vs later half of the timeline
  let trend: AttendancePatterns["trend"] = "insufficient";
  const sorted = [...counted].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length >= 6) {
    const mid = Math.floor(sorted.length / 2);
    const rate = (arr: AttendanceRecord[]) =>
      arr.filter((r) => r.status === "present").length / arr.length;
    const first = rate(sorted.slice(0, mid));
    const second = rate(sorted.slice(mid));
    const delta = second - first;
    trend = delta > 0.08 ? "improving" : delta < -0.08 ? "declining" : "steady";
  }
  return { mostSkippedSubject, mostSkippedDayOrder, trend };
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
  predictedSgpa: number | null;
  bestSgpa: number | null; // if every graded subject became O
  riskyGrades: Array<{ subject: Subject; grade: Grade }>;
}

export function buildProjection(
  subjects: Subject[],
  attendance: AttendanceRecord[],
  timetable: TimetableSlot[],
  marks: Mark[],
  declared: DeclaredHoliday[],
  fromDate: string = todayISO()
): ProjectionReport {
  const effMap = buildEffectiveMap(declared);
  const from = fromDate > SEMESTER_END ? SEMESTER_END : fromDate;

  const recordsBySubject = new Map<string, AttendanceRecord[]>();
  for (const r of attendance) {
    const list = recordsBySubject.get(r.subject_id) ?? [];
    list.push(r);
    recordsBySubject.set(r.subject_id, list);
  }

  const perSubject = subjects.map((s) =>
    projectSubject(s, recordsBySubject.get(s.id) ?? [], timetable, effMap, from)
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

  // Marks projections (honest: we can't see un-entered components, so this
  // is current-pace SGPA + the ceiling if everything graded turned to O)
  const marksBySubject = groupMarksBySubject(marks);
  const sgpa = computeSgpa(subjects, marksBySubject);
  const creditRowsWithMarks = sgpa.rows.filter(
    (r) => r.subject.credits > 0 && r.marks.hasAnyMarks
  );
  const bestSgpa =
    creditRowsWithMarks.length > 0
      ? creditRowsWithMarks.reduce((a, r) => a + 10 * r.subject.credits, 0) /
        creditRowsWithMarks.reduce((a, r) => a + r.subject.credits, 0)
      : null;
  const riskyGrades = sgpa.rows
    .filter((r) => r.marks.hasAnyMarks && (r.marks.grade === "F" || r.marks.grade === "C"))
    .map((r) => ({ subject: r.subject, grade: r.marks.grade }));

  return {
    date: from,
    perSubject,
    overall,
    patterns: patterns(subjects, attendance, effMap),
    whatIf,
    atRisk,
    predictedSgpa: sgpa.sgpa,
    bestSgpa,
    riskyGrades,
  };
}

/** Count of working class-days left in the semester (for headline copy). */
export function classDaysLeft(declared: DeclaredHoliday[], from: string = todayISO()): number {
  const effMap = buildEffectiveMap(declared);
  return Object.keys(effMap).filter((d) => d >= from && d <= SEMESTER_END).length;
}

export { parseISODate };
