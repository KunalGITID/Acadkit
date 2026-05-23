import { useMemo } from "react";
import {
  OFFICIAL_HOLIDAYS,
  SEM_END,
  SEM_START,
} from "@/lib/academicCalendar";
import { groupByDate, getLocalDateString } from "@/lib/attendance";
import type { Attendance } from "@/types/database";
import { cn } from "@/lib/utils";

interface AttendanceHeatmapProps {
  subjectId: string;
  records: Attendance[];
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function dateStr(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function getMonthsInRange(start: string, end: string): { year: number; month: number }[] {
  const s = parseDate(start);
  const e = parseDate(end);
  const months: { year: number; month: number }[] = [];
  const cur = new Date(s.getFullYear(), s.getMonth(), 1);
  const endMonth = new Date(e.getFullYear(), e.getMonth(), 1);

  while (cur <= endMonth) {
    months.push({ year: cur.getFullYear(), month: cur.getMonth() });
    cur.setMonth(cur.getMonth() + 1);
  }
  return months;
}

function statusCellClass(status: string | undefined): string {
  if (status === "present") return "bg-[#4ade80]/40";
  if (status === "absent") return "bg-[#fb7185]/40";
  if (status === "holiday") return "bg-[#facc15]/40";
  return "bg-transparent";
}

export function AttendanceHeatmap({
  subjectId,
  records,
}: AttendanceHeatmapProps) {
  const todayStr = getLocalDateString();
  const dateMap = useMemo(() => {
    const subjectRecords = records.filter((r) => r.subject_id === subjectId);
    return groupByDate(subjectRecords);
  }, [records, subjectId]);

  const months = useMemo(
    () => getMonthsInRange(SEM_START, SEM_END),
    []
  );

  return (
    <div className="space-y-6 pt-4">
      {months.map(({ year, month }) => {
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const firstDow = new Date(year, month, 1).getDay();
        const cells: (string | null)[] = [];
        for (let i = 0; i < firstDow; i++) cells.push(null);
        for (let d = 1; d <= daysInMonth; d++) {
          cells.push(dateStr(year, month, d));
        }

        return (
          <div key={`${year}-${month}`}>
            <p className="mb-2 font-syne text-sm font-medium text-foreground">
              {MONTH_NAMES[month]} {year}
            </p>
            <div className="mb-1 grid grid-cols-7 gap-0.5 text-center text-[10px] text-muted-foreground">
              {WEEKDAYS.map((w, i) => (
                <span key={`${w}-${i}`}>{w}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {cells.map((date, idx) => {
                if (!date) {
                  return <div key={`empty-${idx}`} className="aspect-square" />;
                }
                const inSem = date >= SEM_START && date <= SEM_END;
                const dow = parseDate(date).getDay();
                const isWeekend = dow === 0 || dow === 6;
                const status = dateMap[date];
                const isToday = date === todayStr;
                const isOfficial = !!OFFICIAL_HOLIDAYS[date];

                return (
                  <div
                    key={date}
                    title={`${date}${status ? `: ${status}` : ""}`}
                    className={cn(
                      "relative aspect-square rounded-sm border border-transparent",
                      inSem ? statusCellClass(status) : "opacity-30",
                      isWeekend && !status && "bg-white/5",
                      isToday && "border-[#7c6af7] ring-1 ring-[#7c6af7]"
                    )}
                  >
                    {isOfficial && (
                      <span className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-amber-400" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded-sm bg-[#4ade80]/40" /> Present
        </span>
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded-sm bg-[#fb7185]/40" /> Absent
        </span>
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded-sm bg-[#facc15]/40" /> Holiday
        </span>
      </div>
    </div>
  );
}
