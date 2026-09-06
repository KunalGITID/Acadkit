import { motion } from "framer-motion";
import { Check, Lock, TriangleAlert } from "lucide-react";
import { useUpdateSubject } from "@/hooks/useData";
import { useHasAnimated } from "@/hooks/useHasAnimated";
import { listEntry } from "@/lib/enter";
import { ceilHalf, floorHalf, floorTotal, type SolvedComponent } from "@/lib/plan";
import { GRADE_COLORS, GRADE_TABLE } from "@/lib/grades";
import type { SubjectGradeProjection } from "@/lib/projections";
import { Dot } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import type { Grade } from "@/types";

const TARGETABLE = GRADE_TABLE.filter((g) => g.grade !== "F");

function fmt(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/** A mark you have to reach: rounds up, because 10.4 needs an 10.5. */
function need(n: number): string {
  return fmt(ceilHalf(n));
}

/** A mark you already hold: rounds down, so it is never overstated. */
function have(n: number): string {
  return fmt(floorHalf(n));
}

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

/**
 * The target you're actually chasing in this subject, which is not
 * always what the target SGPA implies — the whole reason this is a
 * per-subject control and not one number in Settings.
 */
function TargetPicker({ p }: { p: SubjectGradeProjection }) {
  const update = useUpdateSubject();
  const color = GRADE_COLORS[p.targetGrade];
  return (
    <label className="relative shrink-0">
      <span className="sr-only">Target grade for {p.subject.name}</span>
      <select
        value={p.targetGrade}
        onChange={(e) =>
          update.mutate({ id: p.subject.id, patch: { target_grade: e.target.value as Grade } })
        }
        className="h-9 appearance-none rounded-xl border-0 pl-3 pr-7 text-sm font-extrabold outline-none focus-visible:ring-2 focus-visible:ring-accent"
        style={{ backgroundColor: `${color}26`, color, boxShadow: `inset 0 0 0 1.5px ${color}` }}
      >
        {TARGETABLE.map((g) => (
          <option key={g.grade} value={g.grade}>
            {g.grade}
          </option>
        ))}
      </select>
      <span
        aria-hidden
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px]"
        style={{ color }}
      >
        ▼
      </span>
    </label>
  );
}

/**
 * One row of the budget: what it's worth, and either what you got or
 * what it now has to return.
 *
 * The required number is the point of the whole page, so it re-derives
 * on every render from the current solve — a result landing anywhere
 * rewrites every row below it.
 */
function ComponentRow({ c, status }: { c: SolvedComponent; status: string }) {
  const graded = c.obtained !== null;
  const impossible = c.required !== null && c.required > c.max + 1e-9;

  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-3 rounded-xl px-3 py-2 text-sm",
        graded ? "bg-surface-2/40" : "bg-surface-2/70"
      )}
    >
      <span className="flex min-w-0 items-baseline gap-2">
        {graded ? (
          <Check className="h-3.5 w-3.5 shrink-0 translate-y-0.5 text-muted" />
        ) : (
          <span
            aria-hidden
            className={cn(
              "h-1.5 w-1.5 shrink-0 translate-y-[-2px] rounded-full",
              impossible ? "bg-bad" : "bg-accent"
            )}
          />
        )}
        <span className={cn("truncate font-semibold", !graded && "text-ink")}>{c.label}</span>
        {c.kind === "unannounced" && (
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-muted">
            tbd
          </span>
        )}
      </span>

      <span className="shrink-0 font-bold tabular">
        {graded ? (
          <span className="text-muted">
            {have(c.obtained!)}<span className="font-semibold">/{have(c.max)}</span>
          </span>
        ) : status === "locked" ? (
          <span className="text-good-deep">anything</span>
        ) : impossible ? (
          <span className="text-bad-deep">
            {need(c.required!)}/{have(c.max)}
          </span>
        ) : (
          <span className="text-accent">
            {need(c.required!)}
            <span className="font-semibold text-muted">/{have(c.max)}</span>
          </span>
        )}
      </span>
    </div>
  );
}

/** floor · pace · ceiling, the three totals the budget brackets. */
function Bracket({ p }: { p: SubjectGradeProjection }) {
  const cells = [
    { label: "Banked", value: p.worstTotal, grade: p.worstGrade, cls: "text-muted" },
    { label: "At your pace", value: p.predictedTotal, grade: p.predictedGrade, cls: "text-ink" },
    { label: "Ace what's left", value: p.bestTotal, grade: p.bestGrade, cls: "text-good-deep" },
  ];
  return (
    <div className="mt-3 grid grid-cols-3 gap-2">
      {cells.map((c) => (
        <div key={c.label} className="rounded-xl bg-surface-2/40 px-2 py-2 text-center">
          <p className="text-[9px] font-bold uppercase tracking-wider text-muted">{c.label}</p>
          <p className={cn("mt-0.5 text-sm font-extrabold tabular", c.cls)}>
            {floorTotal(c.value)}
            <span className="text-[10px] font-bold text-muted">/100</span>
          </p>
          <p className="text-[10px] font-bold" style={{ color: GRADE_COLORS[c.grade] }}>
            {c.grade}
          </p>
        </div>
      ))}
    </div>
  );
}

/**
 * What every grade would cost from here.
 *
 * The unit switches with the shape of what's left. Spread over several
 * components a share is the only honest summary — no single number is
 * "the mark you need". But once one component remains, which is where
 * every subject ends up in the last week, the share *is* a mark out of
 * that component, and "A+ 36/40" is the sentence people actually want.
 */
function GradeRates({ p }: { p: SubjectGradeProjection }) {
  const pending = p.plan.components.filter((c) => c.obtained === null);
  const lone = pending.length === 1 ? pending[0] : null;

  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {p.plan.perGrade.map((g) => {
        const color = GRADE_COLORS[g.grade];
        const text = g.secured
          ? "locked"
          : !g.achievable
            ? "—"
            : g.rate === null
              ? "—"
              : lone
                ? `${need(g.needed)}/${have(lone.max)}`
                : pct(g.rate);
        return (
          <span
            key={g.grade}
            title={
              g.secured
                ? `${g.grade} holds even at zero from here`
                : !g.achievable
                  ? `${g.grade} needs ${need(g.needed)} marks and only ${have(p.pool)} are left`
                  : `${g.grade} needs ${need(g.needed)} of the ${have(p.pool)} marks left`
            }
            className={cn(
              "rounded-lg px-2 py-1 text-[11px] font-bold tabular",
              !g.achievable && "opacity-40"
            )}
            style={{ backgroundColor: `${color}1f`, color }}
          >
            {g.grade} {text}
          </span>
        );
      })}
    </div>
  );
}

/** The one sentence worth reading on the card. */
function Verdict({ p }: { p: SubjectGradeProjection }) {
  const { plan, targetGrade } = p;
  const rate = plan.requiredRate === null ? null : pct(Math.max(0, plan.requiredRate));

  if (plan.status === "final")
    return (
      <>
        Finished at <b className="tabular">{floorTotal(plan.banked)}/100</b> — that's{" "}
        <b style={{ color: GRADE_COLORS[plan.floorGrade] }}>{plan.floorGrade}</b>.
      </>
    );

  if (plan.status === "locked")
    return (
      <>
        <b>{targetGrade}</b> is banked — it holds even scoring zero on everything left. You have{" "}
        <b className="tabular">{have(plan.slack ?? 0)}</b> marks of slack.
      </>
    );

  if (plan.status === "out-of-reach")
    return (
      <>
        <b>{targetGrade}</b> needs <b className="tabular">{need(plan.needed)}</b> marks and only{" "}
        <b className="tabular">{have(plan.pool)}</b> are left.{" "}
        {plan.bestReachable ? (
          <>
            Best still reachable is <b style={{ color: GRADE_COLORS[plan.bestReachable] }}>{plan.bestReachable}</b>.
          </>
        ) : (
          <>Even C is out of reach now.</>
        )}
      </>
    );

  if (!plan.hasAnyMarks)
    return (
      <>
        Nothing graded yet. <b>{targetGrade}</b> needs{" "}
        <b className="text-accent">{rate}</b> of every mark this semester.
      </>
    );

  return (
    <>
      <b>{targetGrade}</b> needs <b className="tabular">{need(plan.needed)}</b> of the{" "}
      <b className="tabular">{have(plan.pool)}</b> marks left — <b className="text-accent">{rate}</b>{" "}
      of everything from here.{" "}
      {plan.paceRate !== null && (
        <span className="text-muted">
          You're taking {pct(plan.paceRate)} so far
          {plan.status === "push" ? ", so this is a step up." : " — you're above the line."}
        </span>
      )}
    </>
  );
}

const BAND: Record<string, string> = {
  locked: "border-good/25 bg-good/10",
  "on-track": "border-good/25 bg-good/10",
  final: "border-transparent bg-surface-2/60",
  push: "border-warn/25 bg-warn/10",
  "out-of-reach": "border-bad/25 bg-bad/10",
};

export function SubjectBudgetCard({ p, index }: { p: SubjectGradeProjection; index: number }) {
  const settled = useHasAnimated("grade-budgets");
  const split = p.internalOnly
    ? "internals are the whole 100"
    : p.internalWeight === 0
      ? "end sem is the whole 100"
      : `${Math.round(p.internalWeight)} internal · ${Math.round(100 - p.internalWeight)} end sem`;

  return (
    <motion.section {...listEntry(index, settled)} className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-start gap-2 font-bold">
            <Dot color={p.subject.color_hex} className="mt-1.5 shrink-0" />
            <span className="line-clamp-2">{p.subject.name}</span>
          </p>
          <p className="mt-0.5 text-xs font-medium text-muted">
            {split} · <b className="tabular">{have(p.banked)}</b> banked,{" "}
            <b className="tabular">{have(p.pool)}</b> to play for
          </p>
        </div>
        <TargetPicker p={p} />
      </div>

      <div
        className={cn(
          "mt-4 rounded-2xl border p-3.5 text-sm font-semibold",
          BAND[p.plan.status] ?? BAND.final
        )}
      >
        <Verdict p={p} />
      </div>

      {p.plan.scaled && (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] font-medium text-muted">
          <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
          Components were recorded in their own units, so they've been scaled onto the{" "}
          {Math.round(p.internalWeight)}-mark internal weight.
        </p>
      )}

      {p.plan.components.length > 0 && (
        <div className="mt-4 space-y-1.5">
          <div className="flex items-center justify-between px-1 text-[10px] font-bold uppercase tracking-widest text-muted">
            <span>Component</span>
            <span className="flex items-center gap-1">
              {p.plan.status === "locked" && <Lock className="h-2.5 w-2.5" />}
              {p.plan.status === "final" ? "Scored" : `Needed for ${p.targetGrade}`}
            </span>
          </div>
          {p.plan.components.map((c) => (
            <ComponentRow key={c.key} c={c} status={p.plan.status} />
          ))}
        </div>
      )}

      <Bracket p={p} />
      <GradeRates p={p} />
    </motion.section>
  );
}
