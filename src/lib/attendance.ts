import type { AttendanceRecord, PortalSnapshot, Subject } from "@/types";

export const MIN_ATTENDANCE = 75;

/** Where a subject's attended/total numbers came from. */
export type AttendanceSource = "manual" | "portal";

export interface SubjectAttendance {
  subject: Subject;
  attended: number;
  total: number; // present + absent (cancelled classes don't count)
  percentage: number | null;
  /** Classes you can skip and stay ≥ 75%. */
  canBunk: number;
  /** Consecutive classes needed to climb back to 75%. */
  needToAttend: number;
  /** "portal" when a snapshot supplied the baseline. */
  source: AttendanceSource;
  /** Percentage the portal itself printed, when a snapshot was used. */
  portalPercentage?: number | null;
  /** Snapshot date the baseline came from, when a snapshot was used. */
  portalAsOf?: string;
}

export function attendanceColor(pct: number | null): string {
  if (pct === null) return "hsl(var(--muted))";
  if (pct >= 75) return "#4ade80";
  if (pct >= 65) return "#facc15";
  return "#fb7185";
}

export function attendanceTextClass(pct: number | null): string {
  if (pct === null) return "text-muted";
  if (pct >= 75) return "text-good-deep";
  if (pct >= 65) return "text-warn-deep";
  return "text-bad-deep";
}

/** Classes you can skip / must attend from here, given a running tally. */
function project(attended: number, total: number): { canBunk: number; needToAttend: number } {
  const threshold = MIN_ATTENDANCE / 100;
  if (total <= 0) return { canBunk: 0, needToAttend: 0 };
  if (attended / total >= threshold) {
    // attended / (total + b) >= t  →  b <= attended/t − total
    return { canBunk: Math.max(0, Math.floor(attended / threshold - total)), needToAttend: 0 };
  }
  // (attended + n) / (total + n) >= t  →  n >= (t·total − attended)/(1 − t)
  return {
    canBunk: 0,
    needToAttend: Math.max(0, Math.ceil((threshold * total - attended) / (1 - threshold))),
  };
}

export function computeSubjectAttendance(
  subject: Subject,
  records: AttendanceRecord[],
  snapshot?: PortalSnapshot
): SubjectAttendance {
  const counted = records.filter((r) => r.status === "present" || r.status === "absent");

  let attended: number;
  let total: number;
  let source: AttendanceSource = "manual";

  if (snapshot && snapshot.conducted > 0) {
    // The portal is authoritative up to its own as-of date; classes marked
    // by hand after that layer on so the number stays live between syncs.
    // Dates are "YYYY-MM-DD", so a string compare is a date compare.
    const since = counted.filter((r) => r.date > snapshot.as_of);
    attended = snapshot.conducted - snapshot.absent + since.filter((r) => r.status === "present").length;
    total = snapshot.conducted + since.length;
    source = "portal";
  } else {
    attended = counted.filter((r) => r.status === "present").length;
    total = counted.length;
  }

  const percentage = total > 0 ? (attended / total) * 100 : null;
  const { canBunk, needToAttend } = project(attended, total);

  return {
    subject,
    attended,
    total,
    percentage,
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
    below75: subjectStats.filter((s) => s.percentage !== null && s.percentage < MIN_ATTENDANCE),
    portalAsOf: asOfDates.length ? asOfDates.sort()[0] : null,
  };
}
