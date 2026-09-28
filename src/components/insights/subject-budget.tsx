import { motion } from "framer-motion";
import { CalendarClock, Check, Gauge, Hourglass, Lock, Plus, TriangleAlert, UserX } from "lucide-react";
import { Link } from "react-router-dom";
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
import { GRADE_COLORS, GRADE_TABLE, gradeForTotal } from "@/lib/grades";
import { formatChance, type SubjectOdds } from "@/lib/odds";
import { setExpected, type ExpectedOutlook, type ExpectedRow } from "@/lib/expected";
import { labelMatchKey } from "@/lib/componentLabel";
import type { SubjectGradeProjection } from "@/lib/projections";
import { Dot } from "@/components/ui/misc";
import { WhatIf } from "@/components/insights/what-if";
import { formatDate, todayISO } from "@/lib/dates";
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
 * always what the target SGPA implies - the whole reason this is a
 * per-subject control and not one number in Settings.
 */
export function TargetPicker({ p }: { p: SubjectGradeProjection }) {
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

/** One row of the budget: what it's worth, and either what you got or what it now has to return. */
function ComponentRow({
  c,
  status,
  subjectId,
  expect,
}: {
  c: SolvedComponent;
  status: string;
  subjectId: string;
  /** Present when this row can take an expectation. */
  expect?: { p: SubjectGradeProjection; row: ExpectedRow };
}) {
  const graded = c.obtained !== null;
  const assumed = c.assumed !== null;
  const impossible = c.required !== null && c.required > c.max + 1e-9;
  // Something to imagine: a graded component has its answer, and one worth
  // nothing has nothing to move.
  const askable = !graded && c.max > 0;
  const [open, setOpen] = useState(false);

  const label = (
    <span className="flex min-w-0 items-baseline gap-2">
      {graded || assumed ? (
        <Check className={cn("h-3.5 w-3.5 shrink-0 translate-y-0.5", assumed ? "text-accent/60" : "text-muted")} />
      ) : (
        <span
          aria-hidden
          className={cn("h-1.5 w-1.5 shrink-0 translate-y-[-2px] rounded-full", impossible ? "bg-bad" : "bg-accent")}
        />
      )}
      <span className={cn("truncate font-semibold", !graded && "text-ink")}>{c.label}</span>
      {c.kind === "unannounced" && (
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-muted">tbd</span>
      )}
      {c.date && (
        <span className={cn("shrink-0 text-[10px] font-semibold", c.overdue ? "text-warn-deep" : "text-muted")}>
          {formatDate(c.date, { day: "numeric", month: "short" })}
        </span>
      )}
    </span>
  );

  const value = expect ? (
    <ExpectInput
      p={expect.p}
      row={expect.row}
      word="target"
      placeholder={status === "locked" ? "any" : c.required === null ? "—" : need(c.required)}
      className={impossible ? "text-bad-deep placeholder:text-bad-deep" : "text-accent placeholder:text-accent"}
    />
  ) : (
    <span className="shrink-0 font-bold tabular">
      {assumed ? (
        <span className="text-muted">
          <span className="font-semibold">assumed </span>
          {have(c.assumed!)}
          <span className="font-semibold">/{have(c.max)}</span>
        </span>
      ) : graded ? (
        <span className="text-muted">
          {have(c.obtained!)}
          <span className="font-semibold">/{have(c.max)}</span>
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
  );

  return (
    <div>
      <div
        className={cn(
          "flex items-baseline justify-between gap-3 rounded-xl px-3 py-2 text-sm",
          graded ? "bg-surface-2/40" : "bg-surface-2/70"
        )}
      >
        {askable ? (
          <button
            type="button"
            className="min-w-0 flex-1 text-left"
            aria-expanded={open}
            aria-label={`What if - ${c.label}`}
            onClick={() => setOpen((v) => !v)}
          >
            {label}
          </button>
        ) : (
          label
        )}
        {value}
      </div>
      {askable && open && (
        <WhatIf
          subjectId={subjectId}
          component={{ label: c.label, type: c.type, max: c.max, isExternal: c.kind === "external" }}
        />
      )}
    </div>
  );
}

/** The end-sem row, which you can answer instead of being asked. */
export function EndSemRow({ p, c }: { p: SubjectGradeProjection; c: SolvedComponent }) {
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

/** Returned · likely · ceiling, the three totals the budget brackets. */
function Bracket({ p, o, odds }: { p: SubjectGradeProjection; o: ExpectedOutlook; odds?: SubjectOdds }) {
  const graded = p.plan.hasAnyMarks;
  const likely = odds && !odds.final ? odds : null;
  const cells = [
    // No grade beside it until the subject is finished: 5/100 is what a 5/5
    // quiz leaves banked, and "F" beside it reads as failing.
    { label: "Returned", value: p.worstTotal as number | null, grade: o.plan.status === "final" ? p.worstGrade : null, cls: "text-muted" },
    {
      label: "Likely",
      value: likely ? likely.median : null,
      grade: likely ? gradeForTotal(likely.median).grade : null,
      cls: "text-ink",
    },
    { label: "Ace what's left", value: o.plan.ceiling, grade: o.plan.ceilingGrade, cls: "text-good-deep" },
  ];
  return (
    <div className="mt-3 grid grid-cols-3 gap-2">
      {cells.map((c) => (
        <div key={c.label} className="rounded-xl bg-surface-2/40 px-2 py-2 text-center">
          <p className="text-[9px] font-bold uppercase tracking-wider text-muted">{c.label}</p>
          {c.value === null ? (
            <p className="mt-0.5 text-sm font-extrabold text-muted">—</p>
          ) : (
            <p className={cn("mt-0.5 text-sm font-extrabold tabular", c.cls)}>
              {floorTotal(c.value)}
              <span className="text-[10px] font-bold text-muted">/100</span>
            </p>
          )}
          {c.grade ? (
            <p className="text-[10px] font-bold" style={{ color: GRADE_COLORS[c.grade] }}>
              {c.grade}
            </p>
          ) : (
            <p className="text-[10px] font-semibold text-muted">{c.label === "Returned" && !graded ? "no marks yet" : "\u00a0"}</p>
          )}
          {c.label === "Likely" && likely && (
            <p className="mt-0.5 text-[10px] font-semibold tabular text-muted" title="Where 8 in 10 simulated semesters finish">
              {floorTotal(likely.p10)}–{floorTotal(likely.p90)}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

/** What every grade would cost from here. */
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

/**
 * The one sentence worth reading on the card: what the target costs from
 * here, with any results you're waiting on counted at what you expect.
 */
function Verdict({ p, o }: { p: SubjectGradeProjection; o: ExpectedOutlook }) {
  const { plan } = o;
  const grade = p.targetGrade;
  const rate = plan.requiredRate === null ? null : pct(Math.max(0, plan.requiredRate));
  const counting = o.pending > 0 ? " counting what you expect" : "";

  if (plan.status === "final")
    return (
      <>
        Finishes at <b className="tabular">{floorTotal(plan.banked)}/100</b>{counting} —{" "}
        <b style={{ color: GRADE_COLORS[plan.floorGrade] }}>{plan.floorGrade}</b>.
      </>
    );

  if (plan.status === "locked")
    return (
      <>
        <b>{grade}</b> is banked{counting} - it holds even scoring zero on everything left. You have{" "}
        <b className="tabular">{have(plan.slack ?? 0)}</b> marks of slack.
      </>
    );

  if (plan.status === "out-of-reach")
    return (
      <>
        <b>{grade}</b> needs <b className="tabular">{need(plan.needed)}</b> marks and only{" "}
        <b className="tabular">{have(plan.pool)}</b> are left{counting}.{" "}
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
        Nothing graded yet. <b>{grade}</b> needs <b className="text-accent">{rate}</b> of every mark this
        semester.
      </>
    );

  // How much of the ask the results you're waiting on already cover.
  const covered = o.pending > 0 ? o.actual.needed - plan.needed : 0;
  return (
    <>
      <b>{grade}</b> needs <b className="tabular">{need(plan.needed)}</b> of the{" "}
      <b className="tabular">{have(plan.pool)}</b> marks left - <b className="text-accent">{rate}</b> of
      everything from here.
      {covered >= 0.5 && (
        <span className="text-muted">
          {" "}Your expected {o.pending === 1 ? "mark covers" : "marks cover"}{" "}
          <b className="tabular text-ink">{have(covered)}</b> of it.
        </span>
      )}
    </>
  );
}

/** The field an expectation is typed into: blank shows `placeholder` (a target, or "?" for a test that's been sat); filled, it counts in the plan as though it were in - but it is never saved as a mark, and the real one replaces it the moment it lands (src/lib/expected.ts). */
function ExpectInput({
  p,
  row,
  word,
  placeholder,
  className,
}: {
  p: SubjectGradeProjection;
  row: ExpectedRow;
  /** The word before the field while it's blank: "target" or "expect". */
  word: string;
  placeholder: string;
  className?: string;
}) {
  const update = useUpdateSubject();
  const c = row.component;
  // Shown in the component's current units, whatever it was typed in.
  const stored =
    row.state === "expected" && row.expected ? fmt(floorHalf((row.expected.obtained / row.expected.max) * c.max)) : "";
  const [draft, setDraft] = useState(stored);
  useEffect(() => setDraft(stored), [stored]);

  function commit() {
    const trimmed = draft.trim();
    if (trimmed === stored) return;
    const n = Number(trimmed);
    if (trimmed !== "" && !Number.isFinite(n)) {
      setDraft(stored);
      return;
    }
    const value = trimmed === "" ? null : { obtained: Math.max(0, Math.min(c.max, n)), max: c.max };
    update.mutate({ id: p.subject.id, patch: { assessment: setExpected(p.subject, c.label, value) } });
  }

  return (
    <span className="flex shrink-0 items-baseline gap-1 font-bold tabular">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted">{stored || draft ? "expect" : word}</span>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        max={c.max}
        step={0.5}
        aria-label={`Marks you expect in ${c.label} for ${p.subject.name}, out of ${have(c.max)}`}
        placeholder={placeholder}
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
          stored ? "text-ink" : className
        )}
      />
      <span className="font-semibold text-muted">/{have(c.max)}</span>
    </span>
  );
}

/**
 * A test that has been sat, or that you've already said how it'll go:
 * nothing can change it now, so it asks what you expect instead of
 * setting a target.
 */
function ExpectField({ p, row, date }: { p: SubjectGradeProjection; row: ExpectedRow; date: string | null }) {
  const c = row.component;
  const expecting = row.state === "expected";
  // The date comes from the returned-marks solve: once an expectation is
  // counted the component reads as marked, and marked ones carry none.
  const sat = !expecting || (!!date && date.slice(0, 10) < todayISO());
  return (
    <div className="flex items-baseline justify-between gap-3 rounded-xl bg-surface-2/70 px-3 py-2 text-sm">
      <span className="flex min-w-0 items-baseline gap-2">
        <Hourglass className={cn("h-3.5 w-3.5 shrink-0 translate-y-0.5", expecting ? "text-accent/70" : "text-warn-deep")} />
        <span className="truncate font-semibold text-ink">{c.label}</span>
        <span className={cn("shrink-0 text-[10px] font-semibold", expecting ? "text-muted" : "text-warn-deep")}>
          {date && `${formatDate(date, { day: "numeric", month: "short" })} · `}
          {!expecting ? "sat - how did it go?" : sat ? "awaiting result" : "expected"}
        </span>
      </span>
      <ExpectInput p={p} row={row} word="expect" placeholder="?" className="text-ink placeholder:text-warn-deep" />
    </div>
  );
}

/** A returned mark, with how far off your guess was if you made one. */
function GradedRow({ row }: { row: ExpectedRow }) {
  const c = row.component;
  const guess = row.expected ? (row.expected.obtained / row.expected.max) * c.max : null;
  const off = guess === null ? null : c.obtained! - guess;
  return (
    <div className="flex items-baseline justify-between gap-3 rounded-xl bg-surface-2/40 px-3 py-2 text-sm">
      <span className="flex min-w-0 items-baseline gap-2">
        <Check className="h-3.5 w-3.5 shrink-0 translate-y-0.5 text-muted" />
        <span className="truncate font-semibold">{c.label}</span>
        {off !== null && Math.abs(off) >= 0.25 && (
          <span className={cn("shrink-0 text-[10px] font-semibold", off > 0 ? "text-good-deep" : "text-warn-deep")}>
            expected {have(guess!)} · {off > 0 ? "+" : "−"}
            {fmt(Math.abs(Math.round(off * 2) / 2))}
          </span>
        )}
      </span>
      <span className="shrink-0 font-bold tabular text-muted">
        {have(c.obtained!)}
        <span className="font-semibold">/{have(c.max)}</span>
      </span>
    </div>
  );
}

/** Whether the end-sem is even available to you. */
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
            {" "}<b className="tabular">{e.min}%</b> - attending everything left tops out at{" "}
            <b className="tabular">{Math.round(e.bestPct)}%</b>. The end-sem is{" "}
            {Math.round(p.internalWeight === 100 ? 0 : 100 - p.internalWeight)} of the marks
            below, and this plan assumes you can sit it.
          </>
        ) : (
          <>
            Attendance is <b className="tabular">{Math.round(e.pct ?? 0)}%</b>. Attend the next{" "}
            <b className="tabular">{e.needToAttend}</b> class
            {e.needToAttend === 1 ? "" : "es"} to clear{" "}
            <b className="tabular">{e.min}%</b>
            {e.min !== 75 && <span className="font-medium"> (ML)</span>}
            {e.clearBy && <> by {formatDate(e.clearBy, { day: "numeric", month: "short" })}</>} —
            below it the end-sem is off the table and none of this applies.
          </>
        )}
      </span>
    </div>
  );
}

/** Worst to best, so the bar reads left to right like a scale. */
const ASCENDING = [...GRADE_TABLE].reverse().map((g) => g.grade);

/** How likely the target is, and how the rest of the chances fall. */
function Odds({ o }: { o: SubjectOdds }) {
  if (o.final) return null;
  const shown = ASCENDING.filter((g) => o.distribution[g] > 0.004);
  return (
    <div className="mt-3 px-1">
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="font-semibold text-muted">
          Chance of <b style={{ color: GRADE_COLORS[o.target] }}>{o.target}</b> or better
        </span>
        <span className="text-sm font-extrabold tabular">{formatChance(o.pTarget)}</span>
      </div>
      <div
        className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-surface-2"
        role="img"
        aria-label={shown.map((g) => `${g} ${formatChance(o.distribution[g])}`).join(", ")}
      >
        {shown.map((g) => (
          <span
            key={g}
            title={`${g}: ${formatChance(o.distribution[g])}`}
            style={{ width: `${o.distribution[g] * 100}%`, backgroundColor: GRADE_COLORS[g] }}
          />
        ))}
      </div>
      <p className="mt-1 text-[10px] font-medium text-muted">
        {o.evidence === 0
          ? "No marks here yet, so this leans on how you do in your other subjects."
          : `From ${o.evidence} graded component${o.evidence === 1 ? "" : "s"} here, and your other subjects.`}
        {o.barred && " Assumes you can't sit the end-sem."}
      </p>
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

/** One subject's budget: what's in, what you're waiting on, and what the target now asks of everything still to come. */
export function SubjectBudgetCard({
  p: base,
  o,
  index,
  odds,
}: {
  p: SubjectGradeProjection;
  o: ExpectedOutlook;
  index: number;
  odds?: SubjectOdds;
}) {
  const settled = useHasAnimated("grade-budgets");
  // Everything forward-looking reads the solve with expectations counted.
  const p = { ...base, plan: o.plan, pool: o.plan.pool };
  const split = p.internalOnly
    ? "internals are the whole 100"
    : p.internalWeight === 0
      ? "end sem is the whole 100"
      : `${Math.round(p.internalWeight)} internal · ${Math.round(100 - p.internalWeight)} end sem`;
  const expected = o.plan.banked - o.actual.banked;
  const next = o.rows.find((r) => r.state === "open" && r.component.date && !r.component.overdue)?.component;
  const dateOf = new Map(o.actual.components.map((c) => [labelMatchKey(c.label), c.date]));

  return (
    <motion.section {...listEntry(index, settled)} className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-start gap-2 font-bold">
            <Dot color={p.subject.color_hex} className="mt-1.5 shrink-0" />
            <span className="line-clamp-2">{p.subject.name}</span>
          </p>
          <p className="mt-0.5 text-xs font-medium text-muted">
            {split} · <b className="tabular">{have(o.actual.banked)}</b> returned
            {o.pending > 0 && (
              <>
                {" "}+ <b className="tabular">{have(expected)}</b> expected
              </>
            )}
            , <b className="tabular">{have(o.plan.pool)}</b> to play for
          </p>
        </div>
        <TargetPicker p={p} />
      </div>

      <Attendance p={p} />

      <div className={cn("mt-4 rounded-2xl border p-3.5 text-sm font-semibold", BAND[o.plan.status] ?? BAND.final)}>
        <Verdict p={p} o={o} />

        {/* The card is waiting on one thing; it may as well offer it. */}
        {!o.plan.hasAnyMarks && o.plan.status !== "final" && (
          <Link
            to="/marks"
            className="mt-2.5 inline-flex h-9 items-center gap-1.5 rounded-xl bg-surface px-3 text-xs font-bold text-ink"
          >
            <Plus className="h-3.5 w-3.5" /> Add a mark
          </Link>
        )}
      </div>

      {odds && <Odds o={odds} />}

      {next && next.required !== null && o.plan.status !== "locked" && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-muted">
          <CalendarClock className="h-3 w-3 shrink-0" />
          Next up: <b className="text-ink">{next.label}</b> on{" "}
          {formatDate(next.date!, { day: "numeric", month: "short" })} · needs{" "}
          <b className="text-accent">{need(next.required)}</b>/{have(next.max)}
        </p>
      )}

      {o.plan.assumedExternal !== null && (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] font-medium text-muted">
          <Gauge className="mt-0.5 h-3 w-3 shrink-0" />
          The internals below are carrying whatever the end-sem doesn't. Clear the end-sem
          field to go back to spreading the target across it too.
        </p>
      )}

      {o.plan.scaled && (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] font-medium text-muted">
          <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
          Components were recorded in their own units, so they've been scaled onto the{" "}
          {Math.round(p.internalWeight)}-mark internal weight.
        </p>
      )}

      {o.rows.length > 0 && (
        <div className="mt-4 space-y-1.5">
          <div className="flex items-center justify-between px-1 text-[10px] font-bold uppercase tracking-widest text-muted">
            <span>Component</span>
            <span className="flex items-center gap-1">
              {o.plan.status === "locked" && <Lock className="h-2.5 w-2.5" />}
              {o.plan.status === "final" ? "Scored" : `Needed for ${p.targetGrade}`}
            </span>
          </div>
          {o.rows.map((r) => {
            const c = r.component;
            if (r.state === "graded" || (r.state === "external" && c.obtained !== null)) return <GradedRow key={c.key} row={r} />;
            if (r.state === "external") return <EndSemRow key={c.key} p={p} c={c} />;
            // Sat and not returned: nothing can move it now, so no target -
            // it asks what you expect instead.
            if (r.state === "expected" || (r.state === "open" && c.overdue))
              return <ExpectField key={c.key} p={p} row={r} date={dateOf.get(labelMatchKey(c.label)) ?? null} />;
            // Still to come: a target, which you can overrule with what you expect.
            const expectable = r.state === "open" && (c.kind === "planned" || c.kind === "deadline") && c.max > 0;
            return (
              <ComponentRow
                key={c.key}
                c={c}
                status={o.plan.status}
                subjectId={p.subject.id}
                expect={expectable ? { p, row: r } : undefined}
              />
            );
          })}
        </div>
      )}

      <Bracket p={base} o={o} odds={odds} />
      <GradeRates p={p} />
    </motion.section>
  );
}
