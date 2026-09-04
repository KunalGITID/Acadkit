import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  CalendarClock,
  Flame,
  Lightbulb,
  ShieldCheck,
  Siren,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Badge, Dot, EmptyState, Skeleton } from "@/components/ui/misc";
import { ProgressRing } from "@/components/viz/progress-ring";
import { AnimatedNumber } from "@/components/viz/animated-number";
import { Segmented } from "@/components/ui/segmented";
import { useAttendance, useMarks, useSettings, useSubjects, useTimetable , usePortalSnapshots } from "@/hooks/useData";
import { attendanceColor } from "@/lib/attendance";
import {
  buildProjection,
  classDaysLeft,
  type SubjectProjection,
} from "@/lib/projections";
import { formatDate, todayISO } from "@/lib/dates";
import { buildEffectiveMap, semesterWindow } from "@/lib/calendar";
import { say, VOICE } from "@/lib/voice";
import { useTone } from "@/hooks/useTone";
import { useSwipe } from "@/hooks/useSwipe";
import { slideTransition, slideVariants } from "@/lib/slide";
import { SwipeHint } from "@/components/ui/swipe-hint";
import { RISK_STYLE } from "@/components/insights/risk";
import { SurvivalPlan } from "@/components/insights/survival-plan";
import { GradesProjection } from "@/components/insights/grades-projection";
import { cn, haptic } from "@/lib/utils";


/** Risk labels read very differently in the brutal register. */
const RISK_VOICE = {
  safe: VOICE.riskSafe,
  watch: VOICE.riskWatch,
  critical: VOICE.riskCritical,
} as const;

function DateBadge({ iso, tone }: { iso: string; tone: "warn" | "good" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[11px] font-bold",
        tone === "warn" ? "bg-warn-deep/15 text-warn-deep" : "bg-good-deep/15 text-good-deep"
      )}
    >
      {formatDate(iso)}
    </span>
  );
}

function ScenarioBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-[11px] font-semibold">
        <span className="text-muted">{label}</span>
        <span className="tabular" style={{ color }}>
          {Math.round(pct)}%
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <motion.div
          className="relative h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
          transition={{ type: "spring", stiffness: 60, damping: 18 }}
        />
      </div>
    </div>
  );
}

function SubjectProjectionCard({ p, index }: { p: SubjectProjection; index: number }) {
  const tone = useTone();
  const risk = RISK_STYLE[p.riskLevel];
  const pace = p.pacePct;

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 26, delay: index * 0.04 }}
      className="card p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-start gap-2 font-bold">
            <Dot color={p.subject.color_hex} className="mt-1.5 shrink-0" />
            <span className="line-clamp-2">{p.subject.name}</span>
          </p>
          <p className="mt-0.5 text-xs font-medium text-muted">
            {p.held > 0 ? `${p.attended}/${p.held} so far` : "no classes marked yet"} ·{" "}
            {p.remaining} class{p.remaining === 1 ? "" : "es"} left
          </p>
        </div>
        <Badge className={cn(risk.bg, risk.text)}>{say(RISK_VOICE[p.riskLevel], tone)}</Badge>
      </div>

      {/* The headline action line */}
      <div className="mt-4 rounded-2xl border bg-surface-2/40 p-3.5">
        {!p.reachable ? (
          <p className="flex items-start gap-2 text-sm font-bold text-bad-deep">
            <Siren className="mt-0.5 h-4 w-4 shrink-0" />
            Can't reach 75% even attending all {p.remaining} remaining — best you can end is{" "}
            {Math.round(p.bestPct)}%.
          </p>
        ) : p.currentPct !== null && p.currentPct < 75 ? (
          <div className="text-sm font-bold text-warn-deep">
            <p className="flex items-start gap-2">
              <TrendingUp className="mt-0.5 h-4 w-4 shrink-0" />
              Attend the next {p.mustAttendStreak} in a row to climb back to 75%
            </p>
            {p.recoveryDate && (
              <p className="ml-6 mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted">
                <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                You'll cross it on <DateBadge iso={p.recoveryDate} tone="warn" />
              </p>
            )}
          </div>
        ) : p.skipBudget > 0 ? (
          <div className="text-sm font-bold text-good-deep">
            <p className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              You can skip {p.skipBudget} more of the remaining {p.remaining} and still finish ≥ 75%
            </p>
            {p.safeUntil && (
              <p className="ml-6 mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted">
                <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                Safe to skip everything up to <DateBadge iso={p.safeUntil} tone="good" />
              </p>
            )}
          </div>
        ) : (
          <p className="flex items-start gap-2 text-sm font-bold text-warn-deep">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            Zero buffer — every one of the {p.remaining} remaining classes counts.
          </p>
        )}
      </div>

      {/* Scenarios */}
      <div className="mt-4 space-y-2.5">
        <ScenarioBar label="If you attend everything left" pct={p.bestPct} color="#4ade80" />
        {pace !== null && (
          <ScenarioBar label="If you keep your current pace" pct={pace} color={attendanceColor(pace)} />
        )}
        <ScenarioBar label="If you skip everything left" pct={p.worstPct} color="#fb7185" />
      </div>
    </motion.section>
  );
}

/**
 * The survival schedule: which of the days ahead you can actually miss.
 *
 * Everything else in Insights is per subject. This is per *day*, which
 * is the unit you make decisions in — nobody decides "I'll attend 73% of
 * Operating Systems", they decide whether to get up on Tuesday.
 */
export default function Insights() {
  const tone = useTone();
  const { data: subjects, isLoading: sL } = useSubjects();
  const { data: attendance, isLoading: aL } = useAttendance();
  const { data: timetable, isLoading: tL } = useTimetable();
  const { data: marks, isLoading: mL } = useMarks();
  const { data: settings } = useSettings();
  const { data: snapshots } = usePortalSnapshots();
  const [view, setView] = useState<"attendance" | "grades" | "plan">("attendance");
  // Same order as the segmented control, so a swipe lands where the eye
  // expects. Ends are walls rather than wrapping: three tabs are all on
  // screen, so wrapping past the last one would look like a mis-swipe.
  const VIEWS = ["attendance", "grades", "plan"] as const;
  const [dir, setDir] = useState(0);
  const [swiped, setSwiped] = useState(false);
  const goView = (next: (typeof VIEWS)[number], delta: number) => {
    setDir(delta);
    setView(next);
  };
  const stepView = (delta: number) => {
    const i = VIEWS.indexOf(view);
    const next = VIEWS[i + delta];
    if (!next) return;
    setSwiped(true);
    haptic();
    goView(next, delta);
  };
  const viewSwipe = useSwipe(() => stepView(1), () => stepView(-1));

  const declared = useMemo(
    () => settings?.declared_holidays ?? [],
    [settings?.declared_holidays]
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
  // Working days ahead, declared holidays already shifted out.
  const effMap = useMemo(
    () => buildEffectiveMap(declared, semWindow),
    [declared, semWindow]
  );
  const report = useMemo(
    () =>
      buildProjection(
        subjects ?? [],
        attendance ?? [],
        timetable ?? [],
        marks ?? [],
        declared,
        todayISO(),
        semWindow
      ),
    [subjects, attendance, timetable, marks, declared, semWindow]
  );

  if (sL || aL || tL || mL) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-44 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const noTimetable = (timetable ?? []).length === 0;
  const daysLeft = classDaysLeft(declared, todayISO(), semWindow);
  const preSem = todayISO() < semWindow.start;
  const o = report.overall;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 px-1">
        <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight lg:text-3xl">
          <Sparkles className="h-6 w-6 text-accent" />{say(VOICE.titleInsights, tone)}</h1>
        <Segmented
          layoutId="insights-view"
          options={[
            { value: "attendance", label: "Attendance" },
            { value: "grades", label: "Grades" },
            { value: "plan", label: say(VOICE.tabSurvival, tone) },
          ]}
          value={view}
          onChange={(v) => {
            const next = v as (typeof VIEWS)[number];
            goView(next, VIEWS.indexOf(next) > VIEWS.indexOf(view) ? 1 : -1);
          }}
          className="w-72"
        />
      </div>

      <SwipeHint id="insights" dismissed={swiped} />

      <motion.div
        key={view}
        custom={dir}
        variants={slideVariants}
        initial="enter"
        animate="center"
        transition={slideTransition}
        data-swipe
        {...viewSwipe}
      >
      {view === "grades" ? (
        <GradesProjection report={report} />
      ) : view === "plan" ? (
        <SurvivalPlan
          subjects={subjects ?? []}
          attendance={attendance ?? []}
          snapshots={snapshots ?? []}
          timetable={timetable ?? []}
          effMap={effMap}
        />
      ) : noTimetable ? (
        <section className="card">
          <EmptyState
            icon={CalendarClock}
            title={say(VOICE.insightsNeedTimetable, tone)}
            description="Attendance projections count your real remaining classes from the day-order calendar — add your class slots and this comes alive. (Grades work without it.)"
          />
        </section>
      ) : (
        <>
          {/* Overall hero */}
          <section className="card flex flex-col items-center gap-5 p-6 sm:flex-row sm:items-center sm:justify-between sm:px-8">
            <ProgressRing
              value={(o.pacePct ?? o.bestPct) || 0}
              size={150}
              strokeWidth={13}
              sweep={270}
              color={attendanceColor(o.pacePct ?? o.bestPct)}
            >
              <div className="flex flex-col items-center">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted">
                  projected
                </span>
                <span
                  className="text-4xl font-extrabold tabular"
                  style={{ color: attendanceColor(o.pacePct ?? o.bestPct) }}
                >
                  <AnimatedNumber value={o.pacePct ?? o.bestPct} decimals={0} />
                  <span className="text-xl">%</span>
                </span>
                <span className="text-[10px] font-semibold text-muted">end of semester</span>
              </div>
            </ProgressRing>

            <div className="grid flex-1 grid-cols-2 gap-3 sm:max-w-xs">
              <Stat label="Now" value={o.currentPct === null ? "—" : `${Math.round(o.currentPct)}%`} />
              <Stat label="Classes left" value={String(o.remaining)} />
              <Stat label="Skip budget" value={String(o.skipBudget)} accent />
              <Stat
                label={preSem ? "Sem days left" : "Class days left"}
                value={String(daysLeft)}
              />
            </div>
          </section>

          {/* At-risk callout */}
          {report.atRisk.length > 0 && (
            <section className="card border-bad/25 bg-bad/5 p-5">
              <p className="flex items-center gap-2 font-bold text-bad-deep">
                <Flame className="h-4 w-4" /> Needs attention
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {report.atRisk.map((p) => (
                  <span
                    key={p.subject.id}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold",
                      RISK_STYLE[p.riskLevel].bg,
                      RISK_STYLE[p.riskLevel].text
                    )}
                  >
                    <Dot color={p.subject.color_hex} className="h-1.5 w-1.5" />
                    {p.subject.code.slice(-4)}
                    {p.pacePct !== null ? ` → ${Math.round(p.pacePct)}%` : ""}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Patterns */}
          <PatternsCard report={report} />

          {/* Per subject */}
          <div className="space-y-3">
            <p className="px-1 text-xs font-bold uppercase tracking-widest text-muted">
              Per subject — projected to {formatDate(semWindow.end)}
            </p>
            {report.perSubject
              .filter((p) => p.held > 0 || p.remaining > 0)
              .map((p, i) => (
                <SubjectProjectionCard key={p.subject.id} p={p} index={i} />
              ))}
          </div>
        </>
      )}
      </motion.div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl border bg-surface-2/40 px-3.5 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted">{label}</p>
      <p className={cn("mt-0.5 text-2xl font-extrabold tabular", accent && "text-accent")}>{value}</p>
    </div>
  );
}

function PatternsCard({ report }: { report: ReturnType<typeof buildProjection> }) {
  const { mostSkippedSubject, mostSkippedDayOrder, trend } = report.patterns;
  if (!mostSkippedSubject && !mostSkippedDayOrder && trend === "insufficient") return null;

  const trendCopy = {
    improving: { icon: TrendingUp, text: "Your attendance is improving lately — nice.", cls: "text-good-deep" },
    declining: { icon: TrendingDown, text: "Your attendance has been slipping recently.", cls: "text-bad-deep" },
    steady: { icon: TrendingUp, text: "Your attendance has held steady.", cls: "text-muted" },
    insufficient: null,
  }[trend];

  return (
    <section className="card space-y-2.5 p-5">
      <p className="flex items-center gap-2 font-bold">
        <Lightbulb className="h-4 w-4 text-accent" /> Patterns
      </p>
      <ul className="space-y-1.5 text-sm font-medium text-muted">
        {mostSkippedSubject && (
          <li>
            Most-skipped subject:{" "}
            <span className="font-bold text-ink">{mostSkippedSubject.subject.name}</span> (
            {mostSkippedSubject.absents} missed)
          </li>
        )}
        {mostSkippedDayOrder && (
          <li>
            You miss the most on{" "}
            <span className="font-bold text-ink">Day Order {mostSkippedDayOrder.dayOrder}</span> (
            {mostSkippedDayOrder.absents} missed)
          </li>
        )}
        {trendCopy && (
          <li className={cn("flex items-center gap-1.5 font-semibold", trendCopy.cls)}>
            <trendCopy.icon className="h-4 w-4" /> {trendCopy.text}
          </li>
        )}
      </ul>
    </section>
  );
}
