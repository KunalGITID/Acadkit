export interface AttendanceStats {
  subjectId: string;
  subjectName: string;
  colorHex: string;
  total: number;
  present: number;
  absent: number;
  percentage: number;
  status: "safe" | "warning" | "danger";
  canBunk: number;
  needToAttend: number;
}

export function computeAttendanceStats(
  subjectId: string,
  subjectName: string,
  colorHex: string,
  records: { status: string }[]
): AttendanceStats {
  const total = records.filter((r) => r.status !== "holiday").length;
  const present = records.filter((r) => r.status === "present").length;
  const absent = records.filter((r) => r.status === "absent").length;
  const percentage = total === 0 ? 100 : Math.round((present / total) * 100);

  const status: AttendanceStats["status"] =
    percentage >= 75 ? "safe" : percentage >= 65 ? "warning" : "danger";

  const canBunk =
    percentage >= 75 ? Math.max(0, Math.floor(present / 0.75 - total)) : 0;

  const needToAttend =
    percentage < 75
      ? Math.max(0, Math.ceil((0.75 * total - present) / 0.25))
      : 0;

  return {
    subjectId,
    subjectName,
    colorHex,
    total,
    present,
    absent,
    percentage,
    status,
    canBunk,
    needToAttend,
  };
}

export function getAttendanceColor(percentage: number): string {
  if (percentage >= 75) return "#4ade80";
  if (percentage >= 65) return "#facc15";
  return "#fb7185";
}

export function groupByDate(
  records: { date: string; status: string }[]
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const r of records) {
    if (!map[r.date] || r.status === "present") {
      map[r.date] = r.status;
    }
  }
  return map;
}

export function getLocalDateString(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function computeOverallAttendance(stats: AttendanceStats[]): {
  percentage: number;
  totalPresent: number;
  totalClasses: number;
  belowThreshold: number;
} {
  const totalPresent = stats.reduce((s, x) => s + x.present, 0);
  const totalClasses = stats.reduce((s, x) => s + x.total, 0);
  const percentage =
    totalClasses === 0
      ? 100
      : Math.round((totalPresent / totalClasses) * 100);
  const belowThreshold = stats.filter((s) => s.percentage < 75).length;

  return { percentage, totalPresent, totalClasses, belowThreshold };
}
