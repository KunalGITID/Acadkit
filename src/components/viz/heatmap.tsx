import { useMemo } from "react";
import { motion } from "framer-motion";
import { SEMESTER_START } from "@/lib/calendar";
import { addDays, formatDate, parseISODate, todayISO } from "@/lib/dates";
import type { AttendanceRecord } from "@/types";

interface HeatmapProps {
  records: AttendanceRecord[];
}

interface DayCell {
  date: string;
  present: number;
  absent: number;
}

/**
 * GitHub-style attendance heatmap: one column per week (Mon–Fri rows)
 * from semester start through today. Green = all present, amber =
 * mixed, red = all absent, neutral = nothing marked.
 */
export function AttendanceHeatmap({ records }: HeatmapProps) {
  const weeks = useMemo(() => {
    const byDate = new Map<string, DayCell>();
    for (const r of records) {
      if (r.status !== "present" && r.status !== "absent") continue;
      const cell = byDate.get(r.date) ?? { date: r.date, present: 0, absent: 0 };
      if (r.status === "present") cell.present++;
      else cell.absent++;
      byDate.set(r.date, cell);
    }

    const today = todayISO();
    const lastMarked = [...byDate.keys()].sort().pop() ?? SEMESTER_START;
    const end = [today, SEMESTER_START, lastMarked].sort().pop()!;
    // Walk back to the Monday of the start week
    let cursor = SEMESTER_START;
    while (parseISODate(cursor).getDay() !== 1) cursor = addDays(cursor, -1);

    const result: Array<Array<DayCell | null>> = [];
    while (cursor <= end) {
      const week: Array<DayCell | null> = [];
      for (let i = 0; i < 5; i++) {
        const date = addDays(cursor, i);
        week.push(date > end ? null : byDate.get(date) ?? { date, present: 0, absent: 0 });
      }
      result.push(week);
      cursor = addDays(cursor, 7);
    }
    return result;
  }, [records]);

  function cellColor(cell: DayCell): string {
    const total = cell.present + cell.absent;
    if (total === 0) return "hsl(var(--line) / 0.08)";
    const ratio = cell.present / total;
    if (ratio === 1) return "#4ade80";
    if (ratio >= 0.5) return "#facc15";
    return "#fb7185";
  }

  return (
    <div className="overflow-x-auto pb-1 scrollbar-none">
      <div className="flex gap-1.5" style={{ minWidth: weeks.length * 18 }}>
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-1.5">
            {week.map((cell, di) =>
              cell === null ? (
                <div key={di} className="h-3.5 w-3.5" />
              ) : (
                <motion.div
                  key={cell.date}
                  initial={{ opacity: 0, scale: 0.4 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: (wi * 5 + di) * 0.006, type: "spring", stiffness: 300, damping: 22 }}
                  className="h-3.5 w-3.5 rounded-[5px]"
                  style={{ backgroundColor: cellColor(cell) }}
                  title={`${formatDate(cell.date)} — ${cell.present} present, ${cell.absent} absent`}
                />
              )
            )}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-4 text-[11px] font-medium text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[4px] bg-good" /> all present
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[4px] bg-warn" /> mixed
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[4px] bg-bad" /> absent
        </span>
      </div>
    </div>
  );
}
