import { motion } from "framer-motion";
import { CalendarClock, Check, Hourglass, Target } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useDeadlines, useMarks, useSettings, useSubjects, useUpdateSubject } from "@/hooks/useData";
import { useHasAnimated } from "@/hooks/useHasAnimated";
import { listEntry } from "@/lib/enter";
import { expectedOutlook, expectedSgpa, setExpected, type ExpectedOutlook, type ExpectedRow } from "@/lib/expected";
import { ceilHalf, floorHalf, floorTotal } from "@/lib/plan";
import { GRADE_COLORS, groupMarksBySubject } from "@/lib/grades";
import type { SubjectGradeProjection, buildProjection } from "@/lib/projections";
import { formatDate, todayISO } from "@/lib/dates";
import { Dot } from "@/components/ui/misc";
import { EndSemRow, TargetPicker } from "@/components/insights/subject-budget";
import { cn } from "@/lib/utils";

/**
 * The Expected view: tests you've sat, counted at what you think they'll
 * return, and the target that leaves for everything still to come.
 *
 * The Actual view reads returned marks only, and that stays true here —
 * nothing typed on this screen is a mark. See src/lib/expected.ts.
 */

function fmt(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}
const need = (n: number) => fmt(ceilHalf(n));
const have = (n: number) => fmt(floorHalf(n));

/**
 * One test you can say something about: blank, it shows the target for
 * this component; filled, it's what you expect back.
 *
 * Committed on blur or Enter, like the end-sem field — it syncs.
 */
function ExpectField({ p, row }: { p: SubjectGradeProjection; row: ExpectedRow }) {
  const update = useUpdateSubject();
  const c = row.component;
  // Shown in the component's current units, whatever it was typed in.
  const stored =
    row.state === "expected" && row.expected
      ? fmt(floorHalf((row.expected.obtained / row.expected.max) * c.max))
      : "";
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

  const expecting = row.state === "expected";
  const impossible = !expecting && c.required !== null && c.required > c.max + 1e-9;

  return (
    <div className="flex items-baseline justify-between gap-3 rounded-xl bg-surface-2/70 px-3 py-2 text-sm">
      <span className="flex min-w-0 items-baseline gap-2">
        {expecting ? (
          <Hourglass className="h-3.5 w-3.5 shrink-0 translate-y-0.5 text-accent/70" />
        ) : (
          <span
            aria-hidden
            className={cn(
              "h-1.5 w-1.5 shrink-0 translate-y-[-2px] rounded-full",
              impossible ? "bg-bad" : "bg-accent"
            )}
          />
        )}
        <span className="truncate font-semibold text-ink">{c.label}</span>
        {c.date && (
          <span className={cn("shrink-0 text-[10px] font-semibold", c.overdue ? "text-warn-deep" : "text-muted")}>
            {formatDate(c.date, { day: "numeric", month: "short" })}
          </span>
        )}
      </span>

      <span className="flex shrink-0 items-baseline gap-1 font-bold tabular">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
          {expecting ? "expect" : "target"}
        </span>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          max={c.max}
          step={0.5}
          aria-label={`Marks you expect in ${c.label} for ${p.subject.name}, out of ${have(c.max)}`}
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
            expecting
              ? "text-ink"
              : impossible
                ? "text-bad-deep placeholder:text-bad-deep"
                : "text-accent placeholder:text-accent"
          )}
        />
        <span className="font-semibold text-muted">/{have(c.max)}</span>
      </span>
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

function TbdRow({ row }: { row: ExpectedRow }) {
  const c = row.component;
  return (
    <div className="flex items-baseline justify-between gap-3 rounded-xl bg-surface-2/70 px-3 py-2 text-sm">
      <span className="flex min-w-0 items-baseline gap-2">
        <span aria-hidden className="h-1.5 w-1.5 shrink-0 translate-y-[-2px] rounded-full bg-accent" />
        <span className="truncate font-semibold text-ink">{c.label}</span>
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-muted">tbd</span>
      </span>
      <span className="shrink-0 font-bold tabular text-accent">
        {c.required === null ? "—" : need(c.required)}
        <span className="font-semibold text-muted">/{have(c.max)}</span>
      </span>
    </div>
  );
}

/** What the target costs once your expectations are counted. */
function Verdict({ p, o }: { p: SubjectGradeProjection; o: ExpectedOutlook }) {
  const { plan } = o;
  const grade = p.targetGrade;
  const counting = o.pending > 0 ? "counting what you expect" : "on what's been returned";

  if (plan.status === "final")
    return (
      <>
        Finishes at <b className="tabular">{floorTotal(plan.banked)}/100</b> {counting} —{" "}
        <b style={{ color: GRADE_COLORS[plan.floorGrade] }}>{plan.floorGrade}</b>.
      </>
    );
  if (plan.status === "locked")
    return (
      <>
        <b>{grade}</b> is locked in {counting}, with <b className="tabular">{have(plan.slack ?? 0)}</b> marks
        to spare.
      </>
    );
  if (plan.status === "out-of-reach")
    return (
      <>
        {counting[0].toUpperCase() + counting.slice(1)}, <b>{grade}</b> needs{" "}
        <b className="tabular">{need(plan.needed)}</b> of only <b className="tabular">{have(plan.pool)}</b>{" "}
        left.{" "}
        {plan.bestReachable ? (
          <>
            Aim for <b style={{ color: GRADE_COLORS[plan.bestReachable] }}>{plan.bestReachable}</b> instead.
          </>
        ) : (
          <>Even C is out of reach.</>
        )}
      </>
    );

  const rate = Math.round(Math.max(0, plan.requiredRate ?? 0) * 100);
  const before = o.pending > 0 ? o.actual.needed - plan.needed : 0;
  return (
    <>
      {counting[0].toUpperCase() + counting.slice(1)}, <b>{grade}</b> needs{" "}
      <b className="tabular">{need(plan.needed)}</b> of the <b className="tabular">{have(plan.pool)}</b> marks
      left — <b className="text-accent">{rate}%</b> of every test from here.
      {o.pending > 0 && Math.abs(before) >= 0.5 && (
        <span className="text-muted"> Your expected {o.pending === 1 ? "mark covers" : "marks cover"}{" "}
          <b className="tabular text-ink">{have(Math.max(0, before))}</b> of it.
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

function ExpectedCard({
  p,
  marks,
  index,
}: {
  p: SubjectGradeProjection;
  marks: Parameters<typeof expectedOutlook>[1];
  index: number;
}) {
  const settled = useHasAnimated("expected-cards");
  const { data: deadlines } = useDeadlines();
  const { data: settings } = useSettings();
  const o = useMemo(
    () =>
      expectedOutlook(p.subject, marks, p.targetGrade, {
        deadlines: deadlines ?? [],
        assumedExternalPct: settings?.assumed_external_pct ?? null,
        today: todayISO(),
      }),
    [p.subject, p.targetGrade, marks, deadlines, settings?.assumed_external_pct]
  );
  // Rows are read from the expected solve, so the end-sem field and the
  // targets beside it both answer with the expectation counted.
  const endSemP = { ...p, plan: o.plan };
  const next = o.rows.find((r) => r.state === "open" && r.component.date && !r.component.overdue);

  return (
    <motion.section {...listEntry(index, settled)} className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-start gap-2 font-bold">
            <Dot color={p.subject.color_hex} className="mt-1.5 shrink-0" />
            <span className="line-clamp-2">{p.subject.name}</span>
          </p>
          <p className="mt-0.5 text-xs font-medium text-muted">
            <b className="tabular">{have(o.actual.banked)}</b> returned
            {o.pending > 0 && (
              <>
                {" "}+ <b className="tabular">{have(o.plan.banked - o.actual.banked)}</b> expected
              </>
            )}
            , <b className="tabular">{have(o.plan.pool)}</b> to play for
          </p>
        </div>
        <TargetPicker p={p} />
      </div>

      <div className={cn("mt-4 rounded-2xl border p-3.5 text-sm font-semibold", BAND[o.plan.status] ?? BAND.final)}>
        <Verdict p={p} o={o} />
      </div>

      {next && next.component.required !== null && o.plan.status !== "locked" && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-muted">
          <CalendarClock className="h-3 w-3 shrink-0" />
          Next up: <b className="text-ink">{next.component.label}</b> on{" "}
          {formatDate(next.component.date!, { day: "numeric", month: "short" })} · aim for{" "}
          <b className="text-accent">{need(next.component.required)}</b>/{have(next.component.max)}
        </p>
      )}

      {o.rows.length > 0 && (
        <div className="mt-4 space-y-1.5">
          <div className="flex items-center justify-between px-1 text-[10px] font-bold uppercase tracking-widest text-muted">
            <span>Component</span>
            <span>Target for {p.targetGrade} · or what you expect</span>
          </div>
          {o.rows.map((r) =>
            r.state === "graded" ? (
              <GradedRow key={r.component.key} row={r} />
            ) : r.state === "external" ? (
              r.component.obtained === null ? (
                <EndSemRow key={r.component.key} p={endSemP} c={r.component} />
              ) : (
                <GradedRow key={r.component.key} row={r} />
              )
            ) : r.state === "unannounced" ? (
              <TbdRow key={r.component.key} row={r} />
            ) : (
              <ExpectField key={r.component.key} p={p} row={r} />
            )
          )}
        </div>
      )}
    </motion.section>
  );
}

export function ExpectedMarks({ report }: { report: ReturnType<typeof buildProjection> }) {
  const { data: subjects } = useSubjects();
  const { data: marks } = useMarks();
  const { data: deadlines } = useDeadlines();
  const bySubject = useMemo(() => groupMarksBySubject(marks ?? []), [marks]);
  // Deadlines too, so a test known only from Deadlines can be expected.
  const sgpa = useMemo(
    () => expectedSgpa(subjects ?? [], bySubject, { deadlines: deadlines ?? [], today: todayISO() }),
    [subjects, bySubject, deadlines]
  );
  const empty = useMemo(() => [], []);

  return (
    <div className="space-y-4">
      <section className="card p-5">
        <div className="flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted">
              <Target className="h-3 w-3" /> SGPA at your pace
            </p>
            <p className="mt-0.5 text-xs font-medium text-muted">
              {sgpa.pending > 0 ? (
                <>
                  counting {sgpa.pending} expected result{sgpa.pending === 1 ? "" : "s"} ·{" "}
                  <b className="tabular text-ink">{sgpa.now?.toFixed(2) ?? "—"}</b> on returned marks
                </>
              ) : (
                "on returned marks — nothing expected yet"
              )}
            </p>
          </div>
          <p className="shrink-0 text-3xl font-extrabold tabular accent-gradient-text">
            {sgpa.expected?.toFixed(2) ?? "—"}
          </p>
        </div>
        <p className="mt-3 text-xs font-medium text-muted">
          Sat a test and waiting on the result? Type what you think you got. It counts here — and
          every test after it gets a target for the grade you pick — but it's never saved as a mark.
          The real one replaces it the moment it's in.
        </p>
      </section>

      {report.gradeProjections.map((p, i) => (
        <ExpectedCard key={p.subject.id} p={p} marks={bySubject.get(p.subject.id) ?? empty} index={i} />
      ))}
    </div>
  );
}
