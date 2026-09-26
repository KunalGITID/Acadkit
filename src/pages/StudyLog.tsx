import { listEntry } from "@/lib/enter";
import { useHasAnimated } from "@/hooks/useHasAnimated";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { BookOpenCheck, ChevronDown, ChevronUp, Flame, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dot, EmptyState, Skeleton } from "@/components/ui/misc";
import { StudyDaySheet } from "@/components/sheets/study-day-sheet";
import { useStudyLog, useSubjects } from "@/hooks/useData";
import { formatMinutes, studyDays, studyStreak, studyTotals } from "@/lib/studyLog";
import { parseISODate, todayISO } from "@/lib/dates";
import { cn } from "@/lib/utils";

const INITIAL_DAYS = 10;

/**
 * Every day you've told the app about: how long, and on what.
 *
 * The absence log's twin — one card per day, newest first, tap to
 * correct it. Totals per subject sit on top because "how much have I put
 * into OS" is the question a log exists to answer.
 */
export default function StudyLog() {
  const settled = useHasAnimated("study-days");
  const { data: log, isLoading: lL } = useStudyLog();
  const { data: subjects, isLoading: sL } = useSubjects();
  const [editDate, setEditDate] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const days = useMemo(() => studyDays(log ?? []), [log]);
  const totals = useMemo(() => studyTotals(log ?? []), [log]);
  const streak = useMemo(() => studyStreak(log ?? []), [log]);
  const byId = useMemo(() => new Map((subjects ?? []).map((s) => [s.id, s])), [subjects]);

  if (lL || sL) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-44" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const grand = totals.reduce((s, t) => s + t.minutes, 0);
  const studiedDays = days.filter((d) => d.total > 0).length;
  const visible = showAll ? days : days.slice(0, INITIAL_DAYS);
  const hidden = days.length - visible.length;
  const top = totals[0]?.minutes ?? 0;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-start justify-between gap-3 px-1">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight lg:text-3xl">Study log</h1>
          <p className="mt-1 text-sm font-medium text-muted">
            {days.length === 0
              ? "Answer the daily question on Home and it lands here."
              : `${formatMinutes(grand)} across ${studiedDays} day${studiedDays === 1 ? "" : "s"} — tap a day to fix it.`}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setEditDate(todayISO())}>
          <Plus className="h-3.5 w-3.5" /> Today
        </Button>
      </div>

      {totals.length > 0 && (
        <section className="card space-y-3 p-5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted">By subject</p>
            {streak > 1 && (
              <span className="flex items-center gap-1 text-xs font-bold text-accent">
                <Flame className="h-3.5 w-3.5" /> {streak} days in a row
              </span>
            )}
          </div>
          {totals.map((t) => {
            const s = byId.get(t.subject_id);
            return (
              <div key={t.subject_id}>
                <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2 font-semibold">
                    <Dot color={s?.color_hex ?? "#888"} className="shrink-0" />
                    <span className="truncate">{s?.name ?? "Removed subject"}</span>
                  </span>
                  <span className="shrink-0 font-bold tabular">{formatMinutes(t.minutes)}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: s?.color_hex ?? "#888" }}
                    initial={{ width: 0 }}
                    animate={{ width: `${(t.minutes / top) * 100}%` }}
                    transition={{ type: "spring", stiffness: 60, damping: 18 }}
                  />
                </div>
              </div>
            );
          })}
        </section>
      )}

      {days.length === 0 ? (
        <section className="card">
          <EmptyState
            icon={BookOpenCheck}
            title="Nothing logged yet"
            description="Each day Home asks how long you studied and on what. Your answers build up here, per day and per subject."
            className="py-10"
          />
        </section>
      ) : (
        visible.map((d, i) => (
          <motion.button
            key={d.date}
            {...listEntry(i, settled)}
            onClick={() => setEditDate(d.date)}
            className="card block w-full p-4 text-left transition-transform active:scale-[0.99]"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-extrabold">
                {parseISODate(d.date).toLocaleDateString("en-IN", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                })}
              </p>
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-[11px] font-bold tabular",
                  d.total > 0 ? "bg-accent/15 text-accent" : "bg-surface-2 text-muted"
                )}
              >
                {d.total > 0 ? formatMinutes(d.total) : "rest day"}
              </span>
            </div>
            {d.bySubject.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {d.bySubject.map((r) => {
                  const s = byId.get(r.subject_id);
                  return (
                    <p key={r.subject_id} className="flex items-center gap-2 text-xs font-semibold text-muted">
                      <Dot color={s?.color_hex ?? "#888"} className="h-1.5 w-1.5" />
                      <span className="truncate text-ink">{s?.name ?? "Removed subject"}</span>
                      <span className="ml-auto shrink-0 tabular">{formatMinutes(r.minutes)}</span>
                    </p>
                  );
                })}
              </div>
            )}
          </motion.button>
        ))
      )}

      {hidden > 0 && (
        <Button variant="secondary" className="w-full" onClick={() => setShowAll(true)}>
          <ChevronDown className="h-4 w-4" /> Show {hidden} older day{hidden === 1 ? "" : "s"}
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

      <StudyDaySheet date={editDate} onClose={() => setEditDate(null)} />
    </div>
  );
}
