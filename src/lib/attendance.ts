import type { AttendanceRecord, Subject } from "@/types";

export const MIN_ATTENDANCE = 75;

export interface SubjectAttendance {
  subject: Subject;
  attended: number;
  total: number; // present + absent (cancelled classes don't count)
  percentage: number | null;
  /** Classes you can skip and stay ≥ 75%. */
  canBunk: number;
  /** Consecutive classes needed to climb back to 75%. */
  needToAttend: number;
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

export function computeSubjectAttendance(
  subject: Subject,
  records: AttendanceRecord[]
): SubjectAttendance {
  const counted = records.filter((r) => r.status === "present" || r.status === "absent");
  const attended = counted.filter((r) => r.status === "present").length;
  const total = counted.length;
  const percentage = total > 0 ? (attended / total) * 100 : null;

  const threshold = MIN_ATTENDANCE / 100;
  let canBunk = 0;
  let needToAttend = 0;
  if (total > 0) {
    if (attended / total >= threshold) {
      // attended / (total + b) >= t  →  b <= attended/t − total
      canBunk = Math.max(0, Math.floor(attended / threshold - total));
    } else {
      // (attended + n) / (total + n) >= t  →  n >= (t·total − attended)/(1 − t)
      needToAttend = Math.max(0, Math.ceil((threshold * total - attended) / (1 - threshold)));
    }
  }
  return { subject, attended, total, percentage, canBunk, needToAttend };
}

export interface OverallAttendance {
  attended: number;
  total: number;
  percentage: number | null;
  subjects: SubjectAttendance[];
  below75: SubjectAttendance[];
}

export function computeOverallAttendance(
  subjects: Subject[],
  records: AttendanceRecord[]
): OverallAttendance {
  const bySubject = new Map<string, AttendanceRecord[]>();
  for (const r of records) {
    const list = bySubject.get(r.subject_id) ?? [];
    list.push(r);
    bySubject.set(r.subject_id, list);
  }
  const subjectStats = subjects.map((s) =>
    computeSubjectAttendance(s, bySubject.get(s.id) ?? [])
  );
  const attended = subjectStats.reduce((sum, s) => sum + s.attended, 0);
  const total = subjectStats.reduce((sum, s) => sum + s.total, 0);
  return {
    attended,
    total,
    percentage: total > 0 ? (attended / total) * 100 : null,
    subjects: subjectStats,
    below75: subjectStats.filter((s) => s.percentage !== null && s.percentage < MIN_ATTENDANCE),
  };
}
