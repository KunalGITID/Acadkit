import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  CalendarClock,
  Flame,
  GraduationCap,
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
import { useAttendance, useMarks, useSettings, useSubjects, useTimetable } from "@/hooks/useData";
import { attendanceColor } from "@/lib/attendance";
import { buildProjection, classDaysLeft, type SubjectProjection } from "@/lib/projections";
import { formatDate, todayISO } from "@/lib/dates";
import { SEMESTER_START, SEMESTER_END } from "@/lib/calendar";
import { cn } from "@/lib/utils";

const RISK_STYLE = {
  safe: { text: "text-good-deep", bg: "bg-good/12", label: "On track" },
  watch: { text: "text-warn-deep", bg: "bg-warn/12", label: "Watch" },
  critical: { text: "text-bad-deep", bg: "bg-bad/12", label: "Critical" },
} as const;

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
          <p className="flex items-center gap-2 font-bold">
            <Dot color={p.subject.color_hex} />
            <span className="truncate">{p.subject.name}</span>
          </p>
          <p className="mt-0.5 text-xs font-medium text-muted">
            {p.held > 0 ? `${p.attended}/${p.held} so far` : "no classes marked yet"} ·{" "}
            {p.remaining} class{p.remaining === 1 ? "" : "es"} left
          </p>
        </div>
        <Badge className={cn(risk.bg, risk.text)}>{risk.label}</Badge>
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
          <p className="flex items-start gap-2 text-sm font-bold text-warn-deep">
            <TrendingUp className="mt-0.5 h-4 w-4 shrink-0" />
            Attend the next {p.mustAttendStreak} in a row to climb back to 75%.
          </p>
        ) : p.skipBudget > 0 ? (
          <p className="flex items-start gap-2 text-sm font-bold text-good-deep">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            You can skip {p.skipBudget} more of the remaining {p.remaining} and still finish ≥ 75%
            {p.safeUntil ? ` — safe to skip everything up to ${formatDate(p.safeUntil)}.` : "."}
          </p>
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

export default function Insights() {
  const { data: subjects, isLoading: sL } = useSubjects();
  const { data: attendance, isLoading: aL } = useAttendance();
  const { data: timetable, isLoading: tL } = useTimetable();
  const { data: marks, isLoading: mL } = useMarks();
  const { data: settings } = useSettings();
  const [view, setView] = useState<"attendance" | "grades">("attendance");

  const declared = useMemo(
    () => settings?.declared_holidays ?? [],
    [settings?.declared_holidays]
  );
  const report = useMemo(
    () =>
      buildProjection(
        subjects ?? [],
        attendance ?? [],
        timetable ?? [],
        marks ?? [],
        declared
      ),
    [subjects, attendance, timetable, marks, declared]
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
  const daysLeft = classDaysLeft(declared);
  const preSem = todayISO() < SEMESTER_START;
  const o = report.overall;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 px-1">
        <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight lg:text-3xl">
          <Sparkles className="h-6 w-6 text-accent" /> Insights
        </h1>
        <Segmented
          layoutId="insights-view"
          options={[
            { value: "attendance", label: "Attendance" },
            { value: "grades", label: "Grades" },
          ]}
          value={view}
          onChange={setView}
          className="w-56"
        />
      </div>

      {noTimetable ? (
        <section className="card">
          <EmptyState
            icon={CalendarClock}
            title="Build your timetable first"
            description="Projections count your real remaining classes from the day-order calendar — add your class slots and this page comes alive."
          />
        </section>
      ) : view === "attendance" ? (
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
              Per subject — projected to {formatDate(SEMESTER_END)}
            </p>
            {report.perSubject
              .filter((p) => p.held > 0 || p.remaining > 0)
              .map((p, i) => (
                <SubjectProjectionCard key={p.subject.id} p={p} index={i} />
              ))}
          </div>
        </>
      ) : (
        <GradesProjection report={report} />
      )}
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

function GradesProjection({ report }: { report: ReturnType<typeof buildProjection> }) {
  return (
    <div className="space-y-4">
      <section className="card flex items-center justify-around gap-3 p-6">
        <div className="text-center">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted">Predicted SGPA</p>
          <p className="mt-1 text-4xl font-extrabold accent-gradient-text">
            {report.predictedSgpa === null ? "—" : <AnimatedNumber value={report.predictedSgpa} decimals={2} />}
          </p>
          <p className="mt-0.5 text-[11px] text-muted">at current pace</p>
        </div>
        <div className="h-12 w-px bg-line/10" />
        <div className="text-center">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted">Ceiling</p>
          <p className="mt-1 text-4xl font-extrabold text-good-deep">
            {report.bestSgpa === null ? "—" : <AnimatedNumber value={report.bestSgpa} decimals={2} />}
          </p>
          <p className="mt-0.5 text-[11px] text-muted">if you ace what's left</p>
        </div>
      </section>

      {report.riskyGrades.length > 0 ? (
        <section className="card border-bad/25 bg-bad/5 p-5">
          <p className="flex items-center gap-2 font-bold text-bad-deep">
            <AlertTriangle className="h-4 w-4" /> Grades at risk
          </p>
          <div className="mt-2 space-y-1.5">
            {report.riskyGrades.map(({ subject, grade }) => (
              <p key={subject.id} className="flex items-center gap-2 text-sm font-semibold">
                <Dot color={subject.color_hex} className="h-2 w-2" />
                <span className="flex-1 truncate">{subject.name}</span>
                <span className="font-bold text-bad-deep">heading for {grade}</span>
              </p>
            ))}
          </div>
        </section>
      ) : (
        <section className="card">
          <EmptyState
            icon={GraduationCap}
            title={report.predictedSgpa === null ? "Add marks to project grades" : "No grades at risk"}
            description={
              report.predictedSgpa === null
                ? "Enter internal marks and your predicted SGPA + ceiling appear here."
                : "Every subject with marks is on pace for a healthy grade. Use the Marks → Calculator tab for target-grade math."
            }
            className="py-8"
          />
        </section>
      )}
    </div>
  );
}
