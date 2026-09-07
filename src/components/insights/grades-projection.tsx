import { motion } from "framer-motion";
import { AlertTriangle, GraduationCap } from "lucide-react";
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
      {/* The per-subject targets are chosen one card at a time. Nothing
          was adding them up, so you could set six of them and never
          find out they came to 7.9. */}
      {report.onTargetSgpa !== null && (
        <section className="card p-5">
          <div className="flex items-baseline justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted">
                If you hit every target
              </p>
              <p className="mt-0.5 text-xs font-medium text-muted">
                the grade you've set on each subject below
              </p>
            </div>
            <p className="shrink-0 text-3xl font-extrabold tabular accent-gradient-text">
              <AnimatedNumber value={report.onTargetSgpa} decimals={2} />
            </p>
          </div>

          {report.targetsOutOfReach > 0 ? (
            <p className="mt-3 flex items-start gap-1.5 text-xs font-semibold text-bad-deep">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {report.targetsOutOfReach === 1
                ? "One of those targets is already out of reach, so this number isn't available any more."
                : `${report.targetsOutOfReach} of those targets are already out of reach, so this number isn't available any more.`}{" "}
              <span className="font-medium text-muted">Re-aim them and it'll be honest again.</span>
            </p>
          ) : (
            <p className="mt-3 text-xs font-medium text-muted">
              {report.onTargetSgpa >= report.targetSgpa ? (
                <>
                  That clears your{" "}
                  <b className="text-ink tabular">{report.targetSgpa.toFixed(1)}</b> — the targets
                  you've set are enough.
                </>
              ) : (
                <>
                  Short of your <b className="text-ink tabular">{report.targetSgpa.toFixed(1)}</b> by{" "}
                  <b className="text-warn-deep tabular">
                    {(report.targetSgpa - report.onTargetSgpa).toFixed(2)}
                  </b>{" "}
                  — aim higher somewhere, or aim the semester lower.
                </>
              )}
            </p>
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
