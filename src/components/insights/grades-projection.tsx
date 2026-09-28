import { useMemo } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, ChevronDown, GraduationCap, Target } from "lucide-react";
import { useDeadlines, useMarks, useSettings } from "@/hooks/useData";
import { useTone } from "@/hooks/useTone";
import { CgpaCard } from "@/components/insights/cgpa-card";
import { SubjectBudgetCard } from "@/components/insights/subject-budget";
import { RISK_STYLE } from "@/components/insights/risk";
import { Dot, EmptyState } from "@/components/ui/misc";
import { AnimatedNumber } from "@/components/viz/animated-number";
import { expectedOutlook, realisedSgpa, type ExpectedOutlook } from "@/lib/expected";
import { countsInSgpa, GRADE_COLORS, groupMarksBySubject } from "@/lib/grades";
import { formatChance, type SemesterOdds } from "@/lib/odds";
import { ceilHalf, floorHalf } from "@/lib/plan";
import type { buildProjection, SubjectGradeProjection } from "@/lib/projections";
import { todayISO } from "@/lib/dates";
import { say, VOICE } from "@/lib/voice";
import { cn } from "@/lib/utils";

/** Everything grade-shaped, in one place: Marks → Targets. */

/** Chased marks round up; held marks round down. See src/lib/plan.ts. */
function need(n: number): string {
  const v = ceilHalf(n);
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

function have(n: number): string {
  const v = floorHalf(n);
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/** The subjects worth pushing on, worst first, each with why: shut out of the end-sem, attendance that decides whether you sit it, a target gone, or one that asks more than you've been giving. */
function pushList(items: { p: SubjectGradeProjection; o: ExpectedOutlook }[]) {
  const rank = ({ p, o }: { p: SubjectGradeProjection; o: ExpectedOutlook }) =>
    p.eligibility.status === "barred" ? 0 : o.plan.status === "out-of-reach" ? 1 : p.eligibility.status === "at-risk" ? 2 : 3;
  return items
    .filter(({ p, o }) => p.eligibility.status === "barred" || p.eligibility.status === "at-risk" || o.plan.status === "out-of-reach" || (o.plan.status === "push" && o.plan.hasAnyMarks))
    .sort((a, b) => rank(a) - rank(b) || (b.p.eligibility.needToAttend ?? 0) - (a.p.eligibility.needToAttend ?? 0));
}

function reason(p: SubjectGradeProjection, o: ExpectedOutlook): string {
  const e = p.eligibility;
  if (e.status === "barred") return "barred from the end-sem";
  if (o.plan.status === "out-of-reach") return `${p.targetGrade} gone`;
  if (e.status === "at-risk") return `attend the next ${e.needToAttend}`;
  return `→ ${need(o.plan.needed)} of ${have(o.plan.pool)}`;
}

export function GradesProjection({
  report,
  odds,
}: {
  report: ReturnType<typeof buildProjection>;
  odds: SemesterOdds;
}) {
  const tone = useTone();
  const { data: marks } = useMarks();
  const { data: deadlines } = useDeadlines();
  const { data: settings } = useSettings();
  const bySubject = useMemo(() => groupMarksBySubject(marks ?? []), [marks]);
  const oddsById = new Map(odds.subjects.map((o) => [o.subjectId, o]));

  // One expected solve per subject, shared by its card and the headline,
  // so the grade in the headline is the one its card argues for.
  const items = useMemo(
    () =>
      report.gradeProjections.map((p) => ({
        p,
        o: expectedOutlook(p.subject, bySubject.get(p.subject.id) ?? [], p.targetGrade, {
          deadlines: deadlines ?? [],
          assumedExternalPct: settings?.assumed_external_pct ?? null,
          today: todayISO(),
        }),
      })),
    [report.gradeProjections, bySubject, deadlines, settings?.assumed_external_pct]
  );
  const graded = items.filter(({ p }) => countsInSgpa(p.subject));
  const ungraded = items.filter(({ p }) => !countsInSgpa(p.subject));
  const realised = useMemo(
    () =>
      realisedSgpa(
        items.map(({ p, o }) => ({ subject: p.subject, targetGrade: p.targetGrade, plan: o.plan, barred: p.eligibility.status === "barred" }))
      ),
    [items]
  );
  const gradeOf = new Map(realised.grades.map((g) => [g.subjectId, g]));
  const push = pushList(graded);

  if (report.gradeProjections.length === 0) {
    return (
      <section className="card">
        <EmptyState
          icon={GraduationCap}
          title={say(VOICE.insightsNeedMarks, tone)}
          description="Add your subjects and this backsolves what every remaining test and the end-sem have to return for the grade you're aiming at - re-spread after each result."
          className="py-10"
        />
      </section>
    );
  }

  return (
    <div className="space-y-4">
      {/* Where the semester lands if your targets and your expectations come
          true - beside how likely that is, simulated from your marks so far. */}
      {realised.sgpa !== null && (
        <section className="card p-5">
          <div className="flex items-baseline justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted">
                <Target className="h-3 w-3" /> {say(VOICE.realisedTitle, tone)}
              </p>
              <p className="mt-0.5 text-xs font-medium text-muted">{say(VOICE.realisedSub, tone)}</p>
            </div>
            <p className="shrink-0 text-4xl font-extrabold tabular accent-gradient-text">
              <AnimatedNumber value={realised.sgpa} decimals={2} />
            </p>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {graded.map(({ p }) => {
              const g = gradeOf.get(p.subject.id);
              if (!g) return null;
              const note =
                g.basis === "best-reachable" ? `${p.targetGrade} is out of reach` : g.basis === "barred" ? "barred from the end-sem" : null;
              return (
                <span
                  key={p.subject.id}
                  className="inline-flex items-baseline gap-1.5 rounded-full bg-surface-2/70 px-2.5 py-1 text-xs font-semibold"
                >
                  <Dot color={p.subject.color_hex} className="h-1.5 w-1.5 shrink-0 -translate-y-px" />
                  <span className="max-w-[9rem] truncate text-muted">{p.subject.short_name?.trim() || p.subject.name}</span>
                  <b style={{ color: GRADE_COLORS[g.grade] }}>{g.grade}</b>
                  {note && <span className="text-[10px] text-warn-deep">· {note}</span>}
                </span>
              );
            })}
          </div>

          <p className="mt-3 text-xs font-medium text-muted">
            {realised.sgpa >= report.targetSgpa ? (
              <>
                That clears your <b className="tabular text-ink">{report.targetSgpa.toFixed(1)}</b> - the targets you've set are
                enough.
              </>
            ) : (
              <>
                Short of your <b className="tabular text-ink">{report.targetSgpa.toFixed(1)}</b> by{" "}
                <b className="tabular text-warn-deep">{(report.targetSgpa - realised.sgpa).toFixed(2)}</b> - aim higher somewhere,
                or aim the semester lower.
              </>
            )}
            {realised.changed > 0 && <span className="text-warn-deep"> {say(VOICE.realisedAdjusted, tone, realised.changed)}</span>}
          </p>

          {odds.sgpa && (
            <div className="mt-4 flex items-baseline justify-between gap-3 border-t pt-3">
              <p className="min-w-0 text-xs font-medium text-muted">
                Chance of <b className="tabular text-ink">{report.targetSgpa.toFixed(1)}</b> or more · likely{" "}
                <b className="tabular text-ink">{odds.sgpa.p10.toFixed(2)}</b>–<b className="tabular text-ink">{odds.sgpa.p90.toFixed(2)}</b>
                <span className="block text-[11px]">
                  The rest of the term simulated 3,000 times from your returned marks; it narrows as results come in.
                </span>
              </p>
              <p className="shrink-0 text-2xl font-extrabold tabular">{formatChance(odds.sgpa.pTarget)}</p>
            </div>
          )}
        </section>
      )}

      {push.length > 0 && (
        <section className="card border-bad/25 bg-bad/5 p-5">
          <p className="flex items-center gap-2 font-bold text-bad-deep">
            <AlertTriangle className="h-4 w-4" /> Grades to push on
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {push.map(({ p, o }) => (
              <span
                key={p.subject.id}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold",
                  RISK_STYLE[p.riskLevel].bg,
                  RISK_STYLE[p.riskLevel].text
                )}
              >
                <Dot color={p.subject.color_hex} className="h-1.5 w-1.5" />
                {p.subject.short_name?.trim() || p.subject.code.slice(-4)} {reason(p, o)}
              </span>
            ))}
          </div>
        </section>
      )}

      <div className="space-y-3">
        <p className="px-1 text-xs font-bold uppercase tracking-widest text-muted">
          Per subject - what's in, and what each test still has to return
        </p>
        <p className="px-1 text-xs font-medium text-muted">
          Sat a test and waiting on the result, or know how one will go? Type what you expect beside it. It counts here and
          re-aims every test after it, but it's never saved as a mark - the real one replaces it. Clear it to take it back.
        </p>
        {graded.map(({ p, o }, i) => (
          <SubjectBudgetCard key={p.subject.id} p={p} o={o} index={i} odds={oddsById.get(p.subject.id)} />
        ))}
      </div>

      {/* Pass/fail courses (UHV-II, Professional Ethics): no grade reaches the
          SGPA, so they're folded away - but their cards, expectations and
          all, are still one tap down. */}
      {ungraded.length > 0 && (
        <details className="group space-y-3">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-1 text-xs font-medium text-muted">
            <span>
              <b className="font-bold uppercase tracking-widest">Not graded</b> - pass or fail, not in your SGPA:{" "}
              {ungraded.map(({ p }) => p.subject.short_name?.trim() || p.subject.name).join(", ")}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
          </summary>
          {ungraded.map(({ p, o }, i) => (
            <SubjectBudgetCard key={p.subject.id} p={p} o={o} index={graded.length + i} odds={oddsById.get(p.subject.id)} />
          ))}
        </details>
      )}

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
