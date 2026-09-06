import { useMemo } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, GraduationCap } from "lucide-react";
import { allocateEffort } from "@/lib/effort";
import { useSettings } from "@/hooks/useData";
import { useTone } from "@/hooks/useTone";
import { CgpaCard } from "@/components/insights/cgpa-card";
import { SubjectBudgetCard } from "@/components/insights/subject-budget";
import { RISK_STYLE } from "@/components/insights/risk";
import { Dot, EmptyState } from "@/components/ui/misc";
import { AnimatedNumber } from "@/components/viz/animated-number";
import { ceilHalf, floorHalf } from "@/lib/plan";
import type { buildProjection } from "@/lib/projections";
import { say, VOICE } from "@/lib/voice";
import { cn } from "@/lib/utils";

/**
 * Everything grade-shaped, in one place.
 *
 * The Marks page used to carry its own calculator strip — "what do I
 * need in the end-sem", a target-SGPA table, and a CGPA pad — while
 * Insights carried the projections. Two screens answering overlapping
 * questions off two different models, which is how you end up with a
 * page saying you're on pace for an O and another saying you need 80%
 * of everything left. They're now one view over one solver
 * (src/lib/plan.ts): the SGPA range, what the target costs, then a card
 * per subject spreading its target across every component still to come.
 */

/** Chased marks round up; held marks round down. See src/lib/plan.ts. */
function need(n: number): string {
  const v = ceilHalf(n);
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

function have(n: number): string {
  const v = floorHalf(n);
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

export function GradesProjection({ report }: { report: ReturnType<typeof buildProjection> }) {
  const tone = useTone();
  const { data: settings } = useSettings();
  const target = settings?.target_sgpa ?? 8.5;
  const plan = useMemo(
    () => allocateEffort(report.gradeProjections, target),
    [report.gradeProjections, target]
  );

  if (report.gradeProjections.length === 0) {
    return (
      <section className="card">
        <EmptyState
          icon={GraduationCap}
          title={say(VOICE.insightsNeedMarks, tone)}
          description="Add your subjects and this backsolves what every remaining test and the end-sem have to return for the grade you're aiming at — re-spread after each result."
          className="py-10"
        />
      </section>
    );
  }

  return (
    <div className="space-y-4">
      {/* The bracket, not a point estimate: what you've banked, where
          your current rate lands you, and the best still available. */}
      <section className="card grid grid-cols-3 divide-x p-5">
        {[
          { label: "Banked", value: report.floorSgpa, sub: "nothing more", cls: "text-bad-deep" },
          { label: "At your pace", value: report.predictedSgpa, sub: "current rate", cls: "accent-gradient-text" },
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

      {/* The three numbers above are a forecast. This is the only part
          you can act on: which subjects have to move, and by how much
          more than they are already tracking. */}
      {plan.status !== "unknown" && (
        <section className="card p-5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted">
              Target {plan.target.toFixed(1)}
            </p>
            <p className="text-xs font-semibold text-muted">
              on pace for <b className="tabular text-ink">{plan.projected?.toFixed(2) ?? "—"}</b>
            </p>
          </div>

          {plan.status === "met" ? (
            <p className="mt-2 text-sm font-bold text-good-deep">
              Already on pace. Hold this and it lands.
            </p>
          ) : plan.status === "out-of-reach" ? (
            <p className="mt-2 text-sm font-semibold">
              Out of reach this semester — acing everything left still tops out at{" "}
              <b className="tabular">{plan.ceiling?.toFixed(2)}</b>.{" "}
              <span className="text-muted">Worth re-aiming at something you can hit.</span>
            </p>
          ) : (
            <>
              <p className="mt-2 text-sm font-semibold">
                {plan.moves.length === 1 ? "One lift gets there" : `${plan.moves.length} lifts get there`}
                , for <b className="text-accent tabular">{need(plan.totalCost)}</b> marks more than
                you're currently on track for:
              </p>
              <ul className="mt-2.5 space-y-2">
                {plan.moves.map((move, i) => (
                  <li
                    key={`${move.subject.id}-${move.to}`}
                    className="flex items-baseline justify-between gap-3 text-xs"
                  >
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className="w-4 shrink-0 text-right font-bold text-muted tabular">
                        {i + 1}
                      </span>
                      <Dot color={move.subject.color_hex} className="shrink-0" />
                      <span className="truncate font-bold">{move.subject.name}</span>
                    </span>
                    <span className="shrink-0 font-semibold">
                      {move.from} → <b className="text-accent">{move.to}</b>
                      <span className="text-muted">
                        {" "}
                        · +{need(move.cost)} marks · {Math.round(move.requiredRate * 100)}% of
                        what's left
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2.5 text-[11px] text-muted">
                Ordered by SGPA bought per extra mark, so the first is where an hour goes
                furthest — not simply the biggest number. Change the target in Settings →
                Academics.
              </p>
            </>
          )}
        </section>
      )}

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
                {p.subject.code.slice(-4)}{" "}
                {p.plan.status === "out-of-reach"
                  ? `${p.targetGrade} gone`
                  : `→ ${need(p.plan.needed)} of ${have(p.pool)}`}
              </span>
            ))}
          </div>
        </section>
      )}

      <div className="space-y-3">
        <p className="px-1 text-xs font-bold uppercase tracking-widest text-muted">
          Per subject — what's banked, what each test still has to return
        </p>
        {report.gradeProjections.map((p, i) => (
          <SubjectBudgetCard key={p.subject.id} p={p} index={i} />
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 26 }}
      >
        <CgpaCard />
      </motion.div>
    </div>
  );
}
