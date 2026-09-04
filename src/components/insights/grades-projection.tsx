import { motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import { GraduationCap } from "lucide-react";
import { Dot, EmptyState } from "@/components/ui/misc";
import { AnimatedNumber } from "@/components/viz/animated-number";
import { GradeBadge } from "@/components/viz/grade-badge";
import { useTone } from "@/hooks/useTone";
import { RISK_STYLE } from "@/components/insights/risk";
import { GRADE_COLORS, GRADE_TABLE } from "@/lib/grades";
import type { buildProjection, SubjectGradeProjection } from "@/lib/projections";
import { say, VOICE } from "@/lib/voice";
import { cn } from "@/lib/utils";

function GradeScenarioBar({
  label,
  total,
  grade,
}: {
  label: string;
  total: number;
  grade: string;
}) {
  const color = GRADE_COLORS[grade as keyof typeof GRADE_COLORS] ?? "hsl(var(--accent))";
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-[11px] font-semibold">
        <span className="text-muted">{label}</span>
        <span className="tabular" style={{ color }}>
          {Math.round(total)}/100 · {grade}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(0, Math.min(100, total))}%` }}
          transition={{ type: "spring", stiffness: 60, damping: 18 }}
        />
      </div>
    </div>
  );
}

function SubjectGradeCard({ p, index }: { p: SubjectGradeProjection; index: number }) {
  const risk = RISK_STYLE[p.riskLevel];

  // Action line
  let action: React.ReactNode;
  if (p.internalOnly) {
    const up = GRADE_TABLE.find((g) => g.points === p.predictedPoints + 1 && g.grade !== "F");
    action = (
      <>
        Internals are the whole 100 here — you're averaging{" "}
        <b>{Math.round(p.internalPct)}%</b> → on pace for <b>{p.predictedGrade}</b>.
        {up && ` Average ≥ ${up.min}% to reach ${up.grade}.`}
      </>
    );
  } else if (p.predictedGrade === "O") {
    action = (
      <>
        On pace for <b>O</b> — hold your internal level and even a soft end-sem keeps it (
        {p.worstGrade} floor).
      </>
    );
  } else if (p.nextGrade) {
    action = (
      <>
        On pace for <b>{p.predictedGrade}</b> ({Math.round(p.predictedTotal)}/100). Score{" "}
        <b className="text-accent">≥ {p.nextGrade.externalNeeded!.toFixed(0)}/40</b> in the end-sem
        to reach <b>{p.nextGrade.grade}</b>.
      </>
    );
  } else {
    action = (
      <>
        On pace for <b>{p.predictedGrade}</b>. Best possible is <b>{p.bestGrade}</b> even acing the
        end-sem.
      </>
    );
  }

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
            {p.internalOnly
              ? `internals = /100 · ${Math.round(p.internalScaled)}/100 locked`
              : `internal locked ${p.internalScaled.toFixed(1)}/60 · end-sem worth 40`}
          </p>
        </div>
        <GradeBadge grade={p.predictedGrade} />
      </div>

      <div className={cn("mt-4 rounded-2xl border p-3.5 text-sm font-semibold", risk.bg)}>
        <span className={risk.text === "text-good-deep" ? "text-ink" : risk.text}>{action}</span>
      </div>

      <div className="mt-4 space-y-2.5">
        {!p.internalOnly && (
          <GradeScenarioBar label="If you ace the end-sem (40/40)" total={p.bestTotal} grade={p.bestGrade} />
        )}
        <GradeScenarioBar label="At your current pace" total={p.predictedTotal} grade={p.predictedGrade} />
        {!p.internalOnly && (
          <GradeScenarioBar label="If the end-sem is blank (0/40)" total={p.worstTotal} grade={p.worstGrade} />
        )}
      </div>

      {/* End-sem needed per grade */}
      {!p.internalOnly && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {p.targets.map((t) => {
            const color = GRADE_COLORS[t.grade];
            const txt = t.locked ? "✓ locked" : t.externalNeeded === null ? "—" : `${t.externalNeeded.toFixed(0)}/40`;
            return (
              <span
                key={t.grade}
                className={cn(
                  "rounded-lg px-2 py-1 text-[11px] font-bold tabular",
                  t.externalNeeded === null && "opacity-40"
                )}
                style={{ backgroundColor: `${color}1f`, color }}
                title={`${t.grade}: ${t.locked ? "secured by internals" : t.externalNeeded === null ? "not reachable" : `needs ${t.externalNeeded.toFixed(1)}/40 in end-sem`}`}
              >
                {t.grade} {txt}
              </span>
            );
          })}
        </div>
      )}
    </motion.section>
  );
}

export function GradesProjection({ report }: { report: ReturnType<typeof buildProjection> }) {
  const tone = useTone();
  if (report.gradeProjections.length === 0) {
    return (
      <section className="card">
        <EmptyState
          icon={GraduationCap}
          title={say(VOICE.insightsNeedMarks, tone)}
          description="Enter internal marks (a CT, an assignment) and this view backsolves exactly what you need in the end-sem for each grade — plus your projected SGPA range."
          className="py-10"
        />
      </section>
    );
  }

  return (
    <div className="space-y-4">
      {/* SGPA range hero */}
      <section className="card grid grid-cols-3 divide-x p-5">
        {[
          { label: "Floor", value: report.floorSgpa, sub: "blank end-sems", cls: "text-bad-deep" },
          { label: "Predicted", value: report.predictedSgpa, sub: "current pace", cls: "accent-gradient-text" },
          { label: "Ceiling", value: report.ceilingSgpa, sub: "ace what's left", cls: "text-good-deep" },
        ].map((s) => (
          <div key={s.label} className="px-2 text-center">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted">{s.label}</p>
            <p className={cn("mt-1 text-3xl font-extrabold tabular", s.cls)}>
              {s.value === null ? "—" : <AnimatedNumber value={s.value} decimals={2} />}
            </p>
            <p className="mt-0.5 text-[10px] text-muted">{s.sub}</p>
          </div>
        ))}
      </section>

      {report.gradesAtRisk.length > 0 && (
        <section className="card border-bad/25 bg-bad/5 p-5">
          <p className="flex items-center gap-2 font-bold text-bad-deep">
            <AlertTriangle className="h-4 w-4" /> Grades to push on
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {report.gradesAtRisk.map((p) => (
              <span
                key={p.subject.id}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold",
                  RISK_STYLE[p.riskLevel].bg,
                  RISK_STYLE[p.riskLevel].text
                )}
              >
                <Dot color={p.subject.color_hex} className="h-1.5 w-1.5" />
                {p.subject.code.slice(-4)} → {p.predictedGrade}
              </span>
            ))}
          </div>
        </section>
      )}

      <div className="space-y-3">
        <p className="px-1 text-xs font-bold uppercase tracking-widest text-muted">
          Per subject — internals locked, end-sem to play for
        </p>
        {report.gradeProjections.map((p, i) => (
          <SubjectGradeCard key={p.subject.id} p={p} index={i} />
        ))}
      </div>
    </div>
  );
}