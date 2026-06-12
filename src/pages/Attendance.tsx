import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  CalendarCheck2,
  ChevronDown,
  GraduationCap,
  PartyPopper,
  ShieldCheck,
  Siren,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dot, EmptyState, Skeleton } from "@/components/ui/misc";
import { ProgressRing } from "@/components/viz/progress-ring";
import { AnimatedNumber } from "@/components/viz/animated-number";
import { AttendanceHeatmap } from "@/components/viz/heatmap";
import { MarkDaySheet } from "@/components/sheets/mark-day-sheet";
import { useAttendance, useSubjects } from "@/hooks/useData";
import {
  attendanceColor,
  attendanceTextClass,
  computeOverallAttendance,
  type SubjectAttendance,
} from "@/lib/attendance";
import { formatTime, todayISO } from "@/lib/dates";
import { parseISODate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { AttendanceRecord, Subject } from "@/types";

function SubjectRow({ stats, index }: { stats: SubjectAttendance; index: number }) {
  const [open, setOpen] = useState(false);
  const pct = stats.percentage;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 26, delay: index * 0.04 }}
      className="card overflow-hidden"
    >
      <button
        className="flex w-full items-center gap-4 p-4 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <ProgressRing value={pct ?? 0} size={56} strokeWidth={6} color={attendanceColor(pct)}>
          <span className={cn("text-xs font-extrabold tabular", attendanceTextClass(pct))}>
            {pct === null ? "—" : `${Math.round(pct)}`}
          </span>
        </ProgressRing>

        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 truncate font-bold">
            <Dot color={stats.subject.color_hex} />
            <span className="truncate">{stats.subject.name}</span>
          </p>
          <p className="mt-0.5 text-xs font-medium text-muted">
            {stats.total === 0
              ? "No classes marked yet"
              : `${stats.attended} of ${stats.total} attended`}
          </p>
        </div>

        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-muted transition-transform", open && "rotate-180")}
        />
      </button>

      {open && stats.total > 0 && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          className="border-t"
        >
          <div className="grid grid-cols-2 divide-x">
            <div className="flex items-center gap-3 p-4">
              <ShieldCheck className="h-5 w-5 shrink-0 text-good-deep" />
              <div>
                <p className="text-lg font-extrabold tabular">{stats.canBunk}</p>
                <p className="text-[11px] font-semibold text-muted">
                  class{stats.canBunk === 1 ? "" : "es"} you can skip
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4">
              <Siren
                className={cn(
                  "h-5 w-5 shrink-0",
                  stats.needToAttend > 0 ? "text-bad-deep" : "text-muted"
                )}
              />
              <div>
                <p className="text-lg font-extrabold tabular">{stats.needToAttend}</p>
                <p className="text-[11px] font-semibold text-muted">needed to reach 75%</p>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

function AbsentLog({
  records,
  subjects,
  onPickDate,
}: {
  records: AttendanceRecord[];
  subjects: Subject[];
  onPickDate: (date: string) => void;
}) {
  const days = useMemo(() => {
    const absents = records
      .filter((r) => r.status === "absent")
      .sort((a, b) => b.date.localeCompare(a.date) || a.start_time.localeCompare(b.start_time));
    const byDate = new Map<string, AttendanceRecord[]>();
    for (const r of absents) {
      const list = byDate.get(r.date) ?? [];
      list.push(r);
      byDate.set(r.date, list);
    }
    return [...byDate.entries()];
  }, [records]);

  return (
    <div className="space-y-3">
      <p className="px-1 text-xs font-bold uppercase tracking-widest text-muted">Absent log</p>
      {days.length === 0 ? (
        <section className="card">
          <EmptyState
            icon={PartyPopper}
            title="Clean sheet"
            description="No absents on record. Every period you miss will show up here."
            className="py-8"
          />
        </section>
      ) : (
        days.map(([date, list], i) => (
          <motion.button
            key={date}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 280, damping: 26, delay: i * 0.03 }}
            onClick={() => onPickDate(date)}
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
                const subject = subjects.find((s) => s.id === r.subject_id);
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
    </div>
  );
}

export default function Attendance() {
  const { data: subjects, isLoading: sLoading } = useSubjects();
  const { data: attendance, isLoading: aLoading } = useAttendance();
  const [markDate, setMarkDate] = useState<string | null>(null);

  const overall = useMemo(
    () => computeOverallAttendance(subjects ?? [], attendance ?? []),
    [subjects, attendance]
  );

  if (sLoading || aLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-44" />
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const pct = overall.percentage;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <h1 className="text-2xl font-extrabold tracking-tight lg:text-3xl">Attendance</h1>
        <Button size="sm" onClick={() => setMarkDate(todayISO())}>
          <CalendarCheck2 className="h-4 w-4" /> Mark today
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Overall gauge */}
        <section className="card flex flex-col items-center p-6 lg:col-span-2">
          <ProgressRing
            value={pct ?? 0}
            size={190}
            strokeWidth={16}
            sweep={270}
            color={attendanceColor(pct)}
          >
            <div className="flex flex-col items-center">
              {pct === null ? (
                <span className="text-2xl font-extrabold text-muted">—</span>
              ) : (
                <span className={cn("text-5xl font-extrabold tabular", attendanceTextClass(pct))}>
                  <AnimatedNumber value={pct} decimals={0} />
                  <span className="text-2xl">%</span>
                </span>
              )}
              <span className="mt-1 text-xs font-bold uppercase tracking-widest text-muted">
                overall
              </span>
            </div>
          </ProgressRing>
          <p className="mt-2 text-center text-sm font-semibold text-muted">
            {pct === null
              ? "Mark your first class to see stats"
              : `${overall.attended} attended · ${overall.total - overall.attended} missed · 75% required`}
          </p>
        </section>

        {/* Heatmap */}
        <section className="card p-5 lg:col-span-3">
          <p className="mb-4 text-xs font-bold uppercase tracking-widest text-muted">
            Semester heatmap
          </p>
          {overall.total === 0 ? (
            <EmptyState
              icon={GraduationCap}
              title="Your semester map starts here"
              description="Every day you mark paints this grid green, amber or red."
              className="py-6"
            />
          ) : (
            <AttendanceHeatmap records={attendance ?? []} />
          )}
        </section>
      </div>

      {/* Per subject */}
      <div className="space-y-3">
        <p className="px-1 text-xs font-bold uppercase tracking-widest text-muted">By subject</p>
        {overall.subjects.map((s, i) => (
          <SubjectRow key={s.subject.id} stats={s} index={i} />
        ))}
      </div>

      <AbsentLog
        records={attendance ?? []}
        subjects={subjects ?? []}
        onPickDate={setMarkDate}
      />

      <MarkDaySheet date={markDate} onClose={() => setMarkDate(null)} />
    </div>
  );
}
