import { useMemo } from "react";
import { motion } from "framer-motion";
import { formatDate, todayISO } from "@/lib/dates";
import type { AttendanceRecord } from "@/types";

interface HeatmapProps {
  records: AttendanceRecord[];
  /**
   * Effective date → day order, holidays already removed
   * (`buildEffectiveMap`). This is the list of days that actually
   * existed; anything absent from it never happened.
   */
  effMap: Record<string, number>;
}

interface DayCell {
  date: string;
  dayOrder: number;
  present: number;
  absent: number;
}

/** Day Order 1–5, so each row of the grid is one day order. */
const ROWS = 5;

/**
 * Attendance heatmap over **working days only**.
 *
 * A calendar-shaped grid has to leave a hole wherever a weekday holiday
 * falls, and a hole is indistinguishable from a day you forgot to mark
 * — both render as an empty cell. Since SRM runs a five-day rotation
 * rather than a week, the honest layout is the sequence of days that
 * actually happened, packed five to a column. Holidays don't leave a
 * gap; the next working day simply takes the slot.
 *
 * That also makes each row a Day Order, so a subject you keep missing
 * shows up as a bad streak along one row.
 */
export function AttendanceHeatmap({ records, effMap }: HeatmapProps) {
  const columns = useMemo(() => {
    const byDate = new Map<string, { present: number; absent: number }>();
    for (const r of records) {
      if (r.status !== "present" && r.status !== "absent") continue;
      const cell = byDate.get(r.date) ?? { present: 0, absent: 0 };
      if (r.status === "present") cell.present++;
      else cell.absent++;
      byDate.set(r.date, cell);
    }

    const today = todayISO();
    // Only days that have happened; the rest of the semester isn't news.
    const days: DayCell[] = Object.keys(effMap)
      .filter((d) => d <= today)
      .sort()
      .map((date) => ({
        date,
        dayOrder: effMap[date],
        ...(byDate.get(date) ?? { present: 0, absent: 0 }),
      }));

    const out: DayCell[][] = [];
    for (let i = 0; i < days.length; i += ROWS) out.push(days.slice(i, i + ROWS));
    return out;
  }, [records, effMap]);

  function cellColor(cell: DayCell): string {
    const total = cell.present + cell.absent;
    if (total === 0) return "hsl(var(--line) / 0.08)";
    const ratio = cell.present / total;
    if (ratio === 1) return "#4ade80";
    if (ratio >= 0.5) return "#facc15";
    return "#fb7185";
  }

  function label(cell: DayCell): string {
    const total = cell.present + cell.absent;
    const head = `${formatDate(cell.date)} · Day ${cell.dayOrder}`;
    return total === 0
      ? `${head} — not marked`
      : `${head} — ${cell.present} present, ${cell.absent} absent`;
  }

  return (
    <div className="overflow-x-auto pb-1 scrollbar-none">
      <motion.div
        className="flex gap-1.5"
        style={{ minWidth: columns.length * 18 }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
      >
        {columns.map((column, ci) => (
          <div key={ci} className="flex flex-col gap-1.5">
            {column.map((cell) => (
              <div
                key={cell.date}
                className="h-3.5 w-3.5 rounded-[5px]"
                style={{ backgroundColor: cellColor(cell) }}
                title={label(cell)}
              />
            ))}
          </div>
        ))}
      </motion.div>
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
