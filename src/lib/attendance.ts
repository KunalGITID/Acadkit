import type { AttendanceRecord, AttendanceStatus, PortalSnapshot, Subject } from "@/types";

export const MIN_ATTENDANCE = 75;

/** The condoned bar where medical leave has been granted. */
export const ML_ATTENDANCE = 65;

/** The bar this particular subject has to clear, as a percentage. */
/**
 * Whether the semester is on medical leave. ML is granted for the whole
 * semester (Settings → Medical leave writes it on every subject), so a
 * subject added now follows the rest: on only when every existing one is.
 */
export function semesterOnMedicalLeave(subjects: Pick<Subject, "medical_leave">[] | undefined): boolean {
  return !!subjects?.length && subjects.every((s) => s.medical_leave);
}

export function minAttendanceFor(subject: Pick<Subject, "medical_leave">): number {
  return subject.medical_leave ? ML_ATTENDANCE : MIN_ATTENDANCE;
}

/** What each status means for the maths, in one place. */

/** Was the class held? Cancelled slots are not part of the denominator. */
export function isCounted(status: AttendanceStatus): boolean {
  return status !== "holiday";
}

/** Did it count as attended? On Duty does, the same way the portal counts it. */
export function isAttended(status: AttendanceStatus): boolean {
  return status === "present" || status === "od";
}

/** Where a subject's attended/total numbers came from. */
export type AttendanceSource = "manual" | "portal";

export interface SubjectAttendance {
  subject: Subject;
  attended: number;
  total: number; // present + absent (cancelled classes don't count)
  percentage: number | null;
  /** The bar this subject has to clear - 65 on medical leave, else 75. */
  min: number;
  /** Classes you can skip and stay at or above `min`. */
  canBunk: number;
  /** Consecutive classes needed to climb back to `min`. */
  needToAttend: number;
  /** "portal" when a snapshot supplied the baseline. */
  source: AttendanceSource;
  /** Percentage the portal itself printed, when a snapshot was used. */
  portalPercentage?: number | null;
  /** Snapshot date the baseline came from, when a snapshot was used. */
  portalAsOf?: string;
}

/**
 * Colour bands run relative to the subject's own bar, so a subject on
 * ML at 68% reads as safe rather than as the amber it would be under
 * the standard threshold. The warning band is the ten points below.
 */
export function attendanceColor(pct: number | null, min: number = MIN_ATTENDANCE): string {
  if (pct === null) return "hsl(var(--muted))";
  if (pct >= min) return "#4ade80";
  if (pct >= min - 10) return "#facc15";
  return "#fb7185";
}

export function attendanceTextClass(pct: number | null, min: number = MIN_ATTENDANCE): string {
  if (pct === null) return "text-muted";
  if (pct >= min) return "text-good-deep";
  if (pct >= min - 10) return "text-warn-deep";
  return "text-bad-deep";
}

/** Classes you can skip / must attend from here, given a running tally. */
function project(
  attended: number,
  total: number,
  min: number
): { canBunk: number; needToAttend: number } {
  if (total <= 0) return { canBunk: 0, needToAttend: 0 };
  if (100 * attended >= min * total) {
    // 100·attended ≥ min·(total + b)  →  b ≤ (100·attended − min·total) / min
    return { canBunk: Math.max(0, Math.floor((100 * attended - min * total) / min)), needToAttend: 0 };
  }
  // 100·(attended + n) ≥ min·(total + n)  →  n ≥ (min·total − 100·attended) / (100 − min)
  return {
    canBunk: 0,
    needToAttend: Math.max(0, Math.ceil((min * total - 100 * attended) / (100 - min))),
  };
}

export function computeSubjectAttendance(
  subject: Subject,
  records: AttendanceRecord[],
  snapshot?: PortalSnapshot
): SubjectAttendance {
  const counted = records.filter((r) => isCounted(r.status));

  let attended: number;
  let total: number;
  let source: AttendanceSource = "manual";

  if (snapshot && snapshot.conducted > 0) {
    // The portal is authoritative up to its own as-of date; classes marked
    // by hand after that layer on so the number stays live between syncs.
    // Dates are "YYYY-MM-DD", so a string compare is a date compare.
    const since = counted.filter((r) => r.date > snapshot.as_of);
    attended = snapshot.conducted - snapshot.absent + since.filter((r) => isAttended(r.status)).length;
    total = snapshot.conducted + since.length;
    source = "portal";
  } else {
    attended = counted.filter((r) => isAttended(r.status)).length;
    total = counted.length;
  }

  const percentage = total > 0 ? (attended / total) * 100 : null;
  const min = minAttendanceFor(subject);
  const { canBunk, needToAttend } = project(attended, total, min);

  return {
    subject,
    attended,
    total,
    percentage,
    min,
    canBunk,
    needToAttend,
    source,
    ...(source === "portal" && snapshot
      ? { portalPercentage: snapshot.percentage, portalAsOf: snapshot.as_of }
      : {}),
  };
}

export interface OverallAttendance {
  attended: number;
  total: number;
  percentage: number | null;
  subjects: SubjectAttendance[];
  below75: SubjectAttendance[];
  /** Oldest snapshot date in play, or null when nothing came from the portal. */
  portalAsOf: string | null;
}

/** Index snapshots by subject code, case- and whitespace-insensitively. */
export function snapshotsByCode(snapshots: PortalSnapshot[]): Map<string, PortalSnapshot> {
  const map = new Map<string, PortalSnapshot>();
  for (const s of snapshots) map.set(s.subject_code.trim().toUpperCase(), s);
  return map;
}

export function computeOverallAttendance(
  subjects: Subject[],
  records: AttendanceRecord[],
  snapshots: PortalSnapshot[] = []
): OverallAttendance {
  const bySubject = new Map<string, AttendanceRecord[]>();
  for (const r of records) {
    const list = bySubject.get(r.subject_id) ?? [];
    list.push(r);
    bySubject.set(r.subject_id, list);
  }
  const byCode = snapshotsByCode(snapshots);
  const subjectStats = subjects.map((s) =>
    computeSubjectAttendance(s, bySubject.get(s.id) ?? [], byCode.get(s.code.trim().toUpperCase()))
  );
  const attended = subjectStats.reduce((sum, s) => sum + s.attended, 0);
  const total = subjectStats.reduce((sum, s) => sum + s.total, 0);
  const asOfDates = subjectStats.map((s) => s.portalAsOf).filter((d): d is string => !!d);
  return {
    attended,
    total,
    percentage: total > 0 ? (attended / total) * 100 : null,
    subjects: subjectStats,
    // Each subject against its own bar: a subject on ML at 68% is not
    // below the line, and counting it as such would send you to fix
    // something that is already fine.
    below75: subjectStats.filter((s) => s.percentage !== null && s.percentage < s.min),
    portalAsOf: asOfDates.length ? asOfDates.sort()[0] : null,
  };
}
