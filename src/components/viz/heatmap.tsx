import { useMemo } from "react";
import { motion } from "framer-motion";
import { formatDate, todayISO } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { AttendanceRecord } from "@/types";

interface HeatmapProps {
  records: AttendanceRecord[];
  /**
   * Effective date → day order, holidays already removed
   * (`buildEffectiveMap`). This is the list of days that actually
   * existed; anything absent from it never happened.
   */
  effMap: Record<string, number>;
  /**
   * Future days to draw after today, with the classes each carries.
   * Omitted, the grid stops at today exactly as it used to.
   */
  future?: { date: string; classes: number }[];
  /** Dates currently pencilled in as skipped. */
  skipped?: ReadonlySet<string>;
  onToggleSkip?: (date: string) => void;
}

interface DayCell {
  date: string;
  dayOrder: number;
  present: number;
  absent: number;
  /** Future cells carry a class count instead of a record. */
  future: boolean;
  classes: number;
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
 *
 * Past cells are filled; future ones are outlines. The difference is
 * deliberately a fill rather than a colour, so "hasn't happened" can
 * never be mistaken for "went badly" — the grid stays readable as a
 * record even while it is being used to plan.
 */
export function AttendanceHeatmap({
  records,
  effMap,
  future,
  skipped,
  onToggleSkip,
}: HeatmapProps) {
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
    const past: DayCell[] = Object.keys(effMap)
      .filter((d) => d <= today)
      .sort()
      .map((date) => ({
        date,
        dayOrder: effMap[date],
        future: false,
        classes: 0,
        ...(byDate.get(date) ?? { present: 0, absent: 0 }),
      }));

    const ahead: DayCell[] = (future ?? []).map(({ date, classes }) => ({
      date,
      dayOrder: effMap[date] ?? 0,
      present: 0,
      absent: 0,
      future: true,
      classes,
    }));

    const days = [...past, ...ahead];
    const out: DayCell[][] = [];
    for (let i = 0; i < days.length; i += ROWS) out.push(days.slice(i, i + ROWS));
    return out;
  }, [records, effMap, future]);

  function cellColor(cell: DayCell): string | undefined {
    if (cell.future) return undefined; // outlined, painted by className
    const total = cell.present + cell.absent;
    if (total === 0) return "hsl(var(--line) / 0.08)";
    const ratio = cell.present / total;
    if (ratio === 1) return "#4ade80";
    if (ratio >= 0.5) return "#facc15";
    return "#fb7185";
  }

  function label(cell: DayCell): string {
    const head = `${formatDate(cell.date)} · Day ${cell.dayOrder}`;
    if (cell.future) {
      const n = `${cell.classes} class${cell.classes === 1 ? "" : "es"}`;
      return skipped?.has(cell.date)
        ? `${head} — skipping, ${n}`
        : `${head} — ${n} ahead${onToggleSkip ? ". Tap to pencil in a skip." : ""}`;
    }
    const total = cell.present + cell.absent;
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
            {column.map((cell) => {
              const isSkipped = cell.future && skipped?.has(cell.date);
              // A day with nothing scheduled can't be skipped, so it
              // stays inert rather than offering a toggle that does
              // nothing to the number.
              const tappable = cell.future && cell.classes > 0 && Boolean(onToggleSkip);
              const square = (
                <span
                  className={cn(
                    "block h-3.5 w-3.5 rounded-[5px]",
                    cell.future && "border border-dashed border-ink/25",
                    isSkipped && "border-solid border-bad bg-bad/30"
                  )}
                  style={{ backgroundColor: cellColor(cell) }}
                />
              );

              // A tappable cell keeps its 14px square but gets the gap as
              // padding, so the target is 20px rather than 14 without the
              // grid loosening. `title` alone was not enough: it never
              // surfaces on touch and gives a screen reader nothing, so
              // the button carries a real label.
              return tappable ? (
                <button
                  key={cell.date}
                  title={label(cell)}
                  aria-label={label(cell)}
                  aria-pressed={isSkipped}
                  onClick={() => onToggleSkip?.(cell.date)}
                  className="-m-[3px] block cursor-pointer p-[3px] transition-transform active:scale-90"
                >
                  {square}
                </button>
              ) : (
                <div key={cell.date} title={label(cell)}>
                  {square}
                </div>
              );
            })}
          </div>
        ))}
      </motion.div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] font-medium text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[4px] bg-good" /> all present
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[4px] bg-warn" /> mixed
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[4px] bg-bad" /> absent
        </span>
        {future && future.length > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[4px] border border-dashed border-ink/25" /> ahead
          </span>
        )}
      </div>
    </div>
  );
}
