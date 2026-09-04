import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ChevronDown,
  GraduationCap,
  ShieldCheck,
  Siren,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Dot, EmptyState, Skeleton } from "@/components/ui/misc";
import { ProgressRing } from "@/components/viz/progress-ring";
import { AnimatedNumber } from "@/components/viz/animated-number";
import { AttendanceHeatmap } from "@/components/viz/heatmap";
import { BunkWallet } from "@/components/viz/bunk-wallet";
import { classesPerDayOrder, forecast, remainingDays } from "@/lib/forecast";
import {
  useAttendance,
  usePortalSnapshots,
  useSettings,
  useSubjects,
  useTimetable,
} from "@/hooks/useData";
import {
  attendanceColor,
  attendanceTextClass,
  computeOverallAttendance,
  type SubjectAttendance,
} from "@/lib/attendance";
import { buildEffectiveMap, semesterWindow } from "@/lib/calendar";
import { relativeDay, todayISO } from "@/lib/dates";
import { attendanceTrend } from "@/lib/projections";
import { syncHealth } from "@/lib/syncHealth";
import { say, VOICE } from "@/lib/voice";
import { useTone } from "@/hooks/useTone";
import { Struck } from "@/components/ui/struck";
import { cn } from "@/lib/utils";

function SubjectRow({ stats, index }: { stats: SubjectAttendance; index: number }) {
  const tone = useTone();
  const [open, setOpen] = useState(false);
  const pct = stats.percentage;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 26, delay: Math.min(index, 5) * 0.04 }}
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
          <p className="flex items-start gap-2 font-bold">
            <Dot color={stats.subject.color_hex} className="mt-1.5 shrink-0" />
            <span className="line-clamp-2">{stats.subject.name}</span>
          </p>
          <p className="mt-0.5 text-xs font-medium text-muted">
            {stats.total === 0
              ? say(VOICE.noClassesMarked, tone)
              : say(VOICE.hoursWasted, tone, stats.attended, stats.total)}
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
                  {say(VOICE.skipBudget, tone, stats.canBunk)}
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

export default function Attendance() {
  const tone = useTone();
  const { data: subjects, isLoading: sLoading } = useSubjects();
  const { data: attendance, isLoading: aLoading } = useAttendance();
  const { data: snapshots } = usePortalSnapshots();
  const { data: settings } = useSettings();
  const { data: timetable } = useTimetable();
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(() => new Set());

  const overall = useMemo(
    () => computeOverallAttendance(subjects ?? [], attendance ?? [], snapshots ?? []),
    [subjects, attendance, snapshots]
  );
  // Depend on the two fields, not the settings object: React Query
  // hands back a new object on every refetch, so listing `settings`
  // would satisfy the linter by defeating the memo.
  const semStart = settings?.sem_start ?? null;
  const semEnd = settings?.sem_end ?? null;
  const semWindow = useMemo(
    () => semesterWindow({ sem_start: semStart, sem_end: semEnd }),
    [semStart, semEnd]
  );
  // Working days only, declared holidays already shifted out — the
  // heatmap draws the days that actually happened, in sequence.
  const health = useMemo(() => syncHealth(snapshots ?? []), [snapshots]);
  // Which way the number is moving. Insights has said this all along,
  // two taps away; it belongs beside the number it describes.
  const trend = useMemo(() => attendanceTrend(attendance ?? []), [attendance]);
  const effMap = useMemo(
    () => buildEffectiveMap(settings?.declared_holidays ?? [], semWindow),
    [settings?.declared_holidays, semWindow]
  );

  // The rest of the semester, each day carrying its day order's class
  // count — what a pencilled-in skip actually costs.
  const future = useMemo(
    () => remainingDays(effMap, classesPerDayOrder(timetable), todayISO()),
    [effMap, timetable]
  );
  const plan = useMemo(
    () => forecast(overall.attended, overall.total, future, skipped),
    [overall.attended, overall.total, future, skipped]
  );
  const toggleSkip = (date: string) =>
    setSkipped((prev) => {
      const next = new Set(prev);
      if (!next.delete(date)) next.add(date);
      return next;
    });

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
        <div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight lg:text-3xl">
              <Struck official="system of academic excellence" honest={say(VOICE.titleAttendance, tone)} />
            </h1>
            {say(VOICE.subAttendance, tone) && (
              <p className="mt-0.5 text-xs italic text-muted">
                ({say(VOICE.subAttendance, tone)})
              </p>
            )}
          </div>
          {overall.portalAsOf && health.state !== "stale" && (
            <p className="mt-0.5 text-[11px] font-medium text-muted">
              Synced {relativeDay(overall.portalAsOf)} · classes marked since are counted on top
            </p>
          )}
          {/* Silent staleness is the failure mode: the sync writes with no
              announcement, so a broken job looks exactly like a quiet
              week. Only shouts once the numbers are actually suspect. */}
          {health.state === "stale" && health.days !== null && (
            <p className="mt-1 flex items-center gap-1.5 text-xs font-bold text-warn-deep">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {say(VOICE.syncStale, tone, health.days)}
            </p>
          )}
          {health.state === "never" && (
            <p className="mt-1 text-xs font-semibold text-muted">
              {say(VOICE.syncNever, tone)}
            </p>
          )}
        </div>
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

          {/* A percentage says where you are; the direction says where
              you're going, which is the half that changes behaviour. */}
          {trend !== "insufficient" && (
            <p
              className={cn(
                "mt-2 flex items-center gap-1.5 text-xs font-bold",
                trend === "improving" && "text-good-deep",
                trend === "declining" && "text-bad-deep",
                trend === "steady" && "text-muted"
              )}
            >
              {trend === "declining" ? (
                <TrendingDown className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <TrendingUp className="h-3.5 w-3.5 shrink-0" />
              )}
              {say(
                trend === "improving"
                  ? VOICE.trendImproving
                  : trend === "declining"
                    ? VOICE.trendDeclining
                    : VOICE.trendSteady,
                tone
              )}
            </p>
          )}
        </section>

        {/* Heatmap */}
        <section className="card p-5 lg:col-span-3">
          <p className="mb-4 text-xs font-bold uppercase tracking-widest text-muted">
            Semester heatmap
          </p>
          {overall.total === 0 ? (
            <EmptyState
              icon={GraduationCap}
              title={say(VOICE.heatmapEmptyTitle, tone)}
              description={say(VOICE.heatmapEmptyBody, tone)}
              className="py-6"
            />
          ) : (
            <>
              <AttendanceHeatmap
                records={attendance ?? []}
                effMap={effMap}
                future={future}
                skipped={skipped}
                onToggleSkip={toggleSkip}
              />

              {/* The forecast only earns space once there is a plan to
                  report on; before that it's a hint, not a readout. */}
              {plan.baseline !== null && (
                <div className="mt-4 border-t pt-3">
                  {skipped.size === 0 ? (
                    <p className="text-xs font-medium text-muted">
                      {say(VOICE.forecastHint, tone)}
                    </p>
                  ) : (
                    <div className="flex items-end justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-muted">
                          {say(VOICE.forecastSelected, tone, skipped.size, plan.classesSkipped)}
                        </p>
                        <p
                          className={cn(
                            "mt-0.5 text-2xl font-extrabold tabular",
                            attendanceTextClass(plan.projected)
                          )}
                        >
                          {plan.projected!.toFixed(1)}%
                          <span className="ml-2 text-sm font-bold text-muted">
                            {plan.delta.toFixed(1)}
                          </span>
                        </p>
                        {plan.belowMinimum && (
                          <p className="mt-0.5 text-xs font-bold text-bad-deep">
                            {say(VOICE.forecastBelow, tone)}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => setSkipped(new Set())}
                        className="shrink-0 rounded-xl bg-surface-2 px-3 py-2 text-xs font-bold"
                      >
                        Clear
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      </div>

      <BunkWallet stats={overall.subjects} />

      {/* Per subject */}
      <div className="space-y-3">
        <p className="px-1 text-xs font-bold uppercase tracking-widest text-muted">By subject</p>
        {overall.subjects.map((s, i) => (
          <SubjectRow key={s.subject.id} stats={s} index={i} />
        ))}
      </div>

    </div>
  );
}
