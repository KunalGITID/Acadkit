import { motion } from "framer-motion";
import { CalendarClock, Check, Gauge, Lock, TriangleAlert, UserX } from "lucide-react";
import { useEffect, useState } from "react";
import { useUpdateSubject } from "@/hooks/useData";
import { useHasAnimated } from "@/hooks/useHasAnimated";
import { listEntry } from "@/lib/enter";
import {
  ceilHalf,
  editableAssessment,
  floorHalf,
  floorTotal,
  type SolvedComponent,
} from "@/lib/plan";
import { GRADE_COLORS, GRADE_TABLE } from "@/lib/grades";
import type { SubjectGradeProjection } from "@/lib/projections";
import { Dot } from "@/components/ui/misc";
import { formatDate } from "@/lib/dates";
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
  const assumed = c.assumed !== null;
  const impossible = c.required !== null && c.required > c.max + 1e-9;

  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-3 rounded-xl px-3 py-2 text-sm",
        graded ? "bg-surface-2/40" : "bg-surface-2/70"
      )}
    >
      <span className="flex min-w-0 items-baseline gap-2">
        {graded || assumed ? (
          <Check
            className={cn(
              "h-3.5 w-3.5 shrink-0 translate-y-0.5",
              assumed ? "text-accent/60" : "text-muted"
            )}
          />
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
        {c.date && (
          <span
            className={cn(
              "shrink-0 text-[10px] font-semibold",
              c.overdue ? "text-warn-deep" : "text-muted"
            )}
          >
            {formatDate(c.date, { day: "numeric", month: "short" })}
            {/* It has happened and its marks aren't in — which is why it
                is still asking for something, and why it is not "next". */}
            {c.overdue && " · marks not in"}
          </span>
        )}
      </span>

      <span className="shrink-0 font-bold tabular">
        {assumed ? (
          <span className="text-muted">
            <span className="font-semibold">assumed </span>
            {have(c.assumed!)}
            <span className="font-semibold">/{have(c.max)}</span>
          </span>
        ) : graded ? (
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

/**
 * The end-sem row, which you can answer instead of being asked.
 *
 * Every other component is solved for. This one you can simply state:
 * type what you expect the paper to return and the internals above
 * re-solve against whatever is left of the target. Blank hands it back
 * to the even spread, and the placeholder is what the spread is
 * currently asking — so the field shows the answer it would give you
 * before you overrule it.
 *
 * Committed on blur or Enter rather than per keystroke: it is a write
 * that syncs across devices, not a slider.
 */
function EndSemRow({ p, c }: { p: SubjectGradeProjection; c: SolvedComponent }) {
  const update = useUpdateSubject();
  const stored = c.assumed === null ? "" : String(floorHalf(c.assumed));
  const [draft, setDraft] = useState(stored);

  useEffect(() => setDraft(stored), [stored]);

  function commit() {
    const trimmed = draft.trim();
    if (trimmed === stored) return;
    const base = editableAssessment(p.subject.assessment, !!p.subject.internal_only);
    const marks = Number(trimmed);
    const next =
      trimmed === "" || !Number.isFinite(marks)
        ? null
        : Math.max(0, Math.min(100, (marks / c.max) * 100));
    if (trimmed !== "" && !Number.isFinite(marks)) {
      setDraft(stored);
      return;
    }
    update.mutate({
      id: p.subject.id,
      patch: { assessment: { ...base, assumedExternalPct: next } },
    });
  }

  return (
    <div className="flex items-baseline justify-between gap-3 rounded-xl bg-surface-2/70 px-3 py-2 text-sm">
      <span className="flex min-w-0 items-baseline gap-2">
        <span
          aria-hidden
          className={cn(
            "h-1.5 w-1.5 shrink-0 translate-y-[-2px] rounded-full",
            c.assumed !== null ? "bg-muted" : "bg-accent"
          )}
        />
        <span className="truncate font-semibold text-ink">{c.label}</span>
        {c.date && (
          <span className="shrink-0 text-[10px] font-semibold text-muted">
            {formatDate(c.date, { day: "numeric", month: "short" })}
          </span>
        )}
      </span>

      <span className="flex shrink-0 items-baseline gap-1 font-bold tabular">
        {/* Say the word. The field alone shows a number and not what
            kind of number it is. */}
        {c.assumed !== null && (
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
            assumed
          </span>
        )}
        <input
          type="number"
          inputMode="decimal"
          min={0}
          max={c.max}
          step={0.5}
          aria-label={`Expected end-sem score for ${p.subject.name}, out of ${have(c.max)}`}
          placeholder={c.required === null ? "—" : need(c.required)}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") setDraft(stored);
          }}
          className={cn(
            "w-12 rounded-lg bg-transparent px-1 py-0.5 text-right font-bold tabular outline-none",
            "focus-visible:bg-surface focus-visible:ring-2 focus-visible:ring-accent",
            c.assumed !== null ? "text-muted" : "text-accent placeholder:text-accent"
          )}
        />
        <span className="font-semibold text-muted">/{have(c.max)}</span>
      </span>
    </div>
  );
}

/** floor · pace · ceiling, the three totals the budget brackets. */
function Bracket({ p }: { p: SubjectGradeProjection }) {
  const band = p.plan.band;
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
          {/* How much your own results actually swing. A pace line with
              nothing beside it reads more certain than it is: a 14/15
              and a 2/15 average to the same place as two 8/15s and mean
              something very different about the forecast. */}
          {c.label === "At your pace" && band && (
            <p
              className="mt-0.5 text-[10px] font-semibold tabular text-muted"
              title={`±1 SD of your ${band.samples} graded components`}
            >
              {floorTotal(band.low)}–{floorTotal(band.high)}
            </p>
          )}
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
 *
 * Six fixed columns, not a wrapping row of chips. Six labels of uneven
 * width never tile evenly across a phone, so the last grade dropped to
 * a line of its own — worse in marks mode, where "A+ 36/40" is half
 * again as wide as "A+ 77%". Stacking the value under the grade halves
 * the width each cell needs, so the ladder holds one line at any size
 * in either unit, and six columns of the same shape read as a table you
 * can scan across, which is what this always was.
 */
function GradeRates({ p }: { p: SubjectGradeProjection }) {
  const pending = p.plan.components.filter((c) => c.obtained === null);
  const lone = pending.length === 1 ? pending[0] : null;

  return (
    <div className="mt-3 grid grid-cols-6 gap-1">
      {p.plan.perGrade.map((g) => {
        const color = GRADE_COLORS[g.grade];
        const text = g.secured
          ? "locked"
          : !g.achievable || g.rate === null
            ? "\u2014"
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
              "flex min-w-0 flex-col items-center rounded-lg px-0.5 py-1.5",
              !g.achievable && "opacity-40"
            )}
            style={{ backgroundColor: `${color}1f`, color }}
          >
            <span className="text-[11px] font-extrabold leading-none">{g.grade}</span>
            <span className="mt-1 w-full truncate text-center text-[10px] font-bold leading-none tabular">
              {text}
            </span>
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

/**
 * Whether the end-sem is even available to you.
 *
 * Placed above the verdict rather than beside the attendance figures on
 * another tab, because below the minimum the entire plan underneath is
 * conditional on something the plan itself cannot fix. A card that
 * calmly asks for 32/40 in an exam you will not be permitted to sit is
 * worse than one that says nothing.
 */
function Attendance({ p }: { p: SubjectGradeProjection }) {
  const e = p.eligibility;
  if (e.status === "safe" || e.status === "unknown") return null;
  const barred = e.status === "barred";

  return (
    <div
      className={cn(
        "mt-4 flex items-start gap-2 rounded-2xl border p-3.5 text-sm font-semibold",
        barred ? "border-bad/30 bg-bad/10 text-bad-deep" : "border-warn/30 bg-warn/10"
      )}
    >
      <UserX className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        {barred ? (
          <>
            Attendance is <b className="tabular">{Math.round(e.pct ?? 0)}%</b> and cannot reach
            75% — attending everything left tops out at{" "}
            <b className="tabular">{Math.round(e.bestPct)}%</b>. The end-sem is{" "}
            {Math.round(p.internalWeight === 100 ? 0 : 100 - p.internalWeight)} of the marks
            below, and this plan assumes you can sit it.
          </>
        ) : (
          <>
            Attendance is <b className="tabular">{Math.round(e.pct ?? 0)}%</b>. Attend the next{" "}
            <b className="tabular">{e.needToAttend}</b> class
            {e.needToAttend === 1 ? "" : "es"} to clear 75%
            {e.clearBy && <> by {formatDate(e.clearBy, { day: "numeric", month: "short" })}</>} —
            below it the end-sem is off the table and none of this applies.
          </>
        )}
      </span>
    </div>
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

      <Attendance p={p} />

      <div
        className={cn(
          "mt-4 rounded-2xl border p-3.5 text-sm font-semibold",
          BAND[p.plan.status] ?? BAND.final
        )}
      >
        <Verdict p={p} />
      </div>

      {p.plan.next && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-muted">
          <CalendarClock className="h-3 w-3 shrink-0" />
          Next up: <b className="text-ink">{p.plan.next.label}</b> on{" "}
          {formatDate(p.plan.next.date!, { day: "numeric", month: "short" })}
          {p.plan.next.required !== null && (
            <>
              {" "}
              · needs <b className="text-accent">{need(p.plan.next.required)}</b>/
              {have(p.plan.next.max)}
            </>
          )}
        </p>
      )}

      {p.plan.assumedExternal !== null && (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] font-medium text-muted">
          <Gauge className="mt-0.5 h-3 w-3 shrink-0" />
          The internals below are carrying whatever the end-sem doesn't. Clear the end-sem
          field to go back to spreading the target across it too.
        </p>
      )}

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
          {p.plan.components.map((c) =>
            c.kind === "external" && c.obtained === null ? (
              <EndSemRow key={c.key} p={p} c={c} />
            ) : (
              <ComponentRow key={c.key} c={c} status={p.plan.status} />
            )
          )}
        </div>
      )}

      <Bracket p={p} />
      <GradeRates p={p} />
    </motion.section>
  );
}
