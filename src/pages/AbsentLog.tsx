import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ChevronDown, ChevronUp, PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dot, EmptyState, Skeleton } from "@/components/ui/misc";
import { MarkDaySheet } from "@/components/sheets/mark-day-sheet";
import { useAttendance, useSubjects } from "@/hooks/useData";
import { formatTime, parseISODate } from "@/lib/dates";
import type { AttendanceRecord } from "@/types";

const INITIAL_DAYS = 6;

export default function AbsentLog() {
  const { data: attendance, isLoading: aLoading } = useAttendance();
  const { data: subjects, isLoading: sLoading } = useSubjects();
  const [markDate, setMarkDate] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const days = useMemo(() => {
    const absents = (attendance ?? [])
      .filter((r) => r.status === "absent")
      .sort((a, b) => b.date.localeCompare(a.date) || a.start_time.localeCompare(b.start_time));
    const byDate = new Map<string, AttendanceRecord[]>();
    for (const r of absents) {
      const list = byDate.get(r.date) ?? [];
      list.push(r);
      byDate.set(r.date, list);
    }
    return [...byDate.entries()];
  }, [attendance]);

  if (aLoading || sLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-44" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const totalMissed = days.reduce((s, [, list]) => s + list.length, 0);
  const visibleDays = showAll ? days : days.slice(0, INITIAL_DAYS);
  const hiddenCount = days.length - visibleDays.length;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="px-1">
        <h1 className="text-2xl font-extrabold tracking-tight lg:text-3xl">Absent log</h1>
        <p className="mt-1 text-sm font-medium text-muted">
          {totalMissed === 0
            ? "Every period you miss will show up here."
            : `${totalMissed} period${totalMissed === 1 ? "" : "s"} missed across ${days.length} day${days.length === 1 ? "" : "s"} — tap a day to fix mistakes.`}
        </p>
      </div>

      {days.length === 0 ? (
        <section className="card">
          <EmptyState
            icon={PartyPopper}
            title="Clean sheet"
            description="No absents on record. Keep it that way!"
            className="py-10"
          />
        </section>
      ) : (
        visibleDays.map(([date, list], i) => (
          <motion.button
            key={date}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 280, damping: 26, delay: i * 0.03 }}
            onClick={() => setMarkDate(date)}
            className="card block w-full p-4 text-left transition-transform active:scale-[0.99]"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-extrabold">
                {parseISODate(date).toLocaleDateString("en-IN", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                })}
              </p>
              <span className="rounded-full bg-bad/10 px-2.5 py-0.5 text-[11px] font-bold text-bad-deep">
                {list.length} missed
              </span>
            </div>
            <div className="mt-2 space-y-1.5">
              {list.map((r) => {
                const subject = subjects?.find((s) => s.id === r.subject_id);
                return (
                  <p
                    key={r.id}
                    className="flex items-center gap-2 text-xs font-semibold text-muted"
                  >
                    <Dot color={subject?.color_hex ?? "#888"} className="h-1.5 w-1.5" />
                    <span className="truncate text-ink">{subject?.name ?? "Unknown subject"}</span>
                    <span className="ml-auto shrink-0 tabular">{formatTime(r.start_time)}</span>
                  </p>
                );
              })}
            </div>
          </motion.button>
        ))
      )}

      {hiddenCount > 0 && (
        <Button variant="secondary" className="w-full" onClick={() => setShowAll(true)}>
          <ChevronDown className="h-4 w-4" /> Show {hiddenCount} older day
          {hiddenCount === 1 ? "" : "s"}
        </Button>
      )}
      {showAll && days.length > INITIAL_DAYS && (
        <Button
          variant="ghost"
          className="w-full"
          onClick={() => {
            setShowAll(false);
            window.scrollTo({ top: 0 });
          }}
        >
          <ChevronUp className="h-4 w-4" /> Show less
        </Button>
      )}

      <MarkDaySheet date={markDate} onClose={() => setMarkDate(null)} />
    </div>
  );
}
