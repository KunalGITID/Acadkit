import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Calculator, Target, TrendingUp } from "lucide-react";
import { Field, Input, Select } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Dot } from "@/components/ui/misc";
import { AnimatedNumber } from "@/components/viz/animated-number";
import {
  GRADE_COLORS,
  GRADE_TABLE,
  minGradeForPoints,
  type Grade,
  type SubjectMarks,
} from "@/lib/grades";
import { cn } from "@/lib/utils";
import type { Subject } from "@/types";

type Row = { subject: Subject; marks: SubjectMarks };

const TARGET_GRADES = GRADE_TABLE.filter((g) => g.grade !== "F");

/** Scaled internal score locked in so far: /60 for split subjects, /100 for internal-only. */
function internalScaled(row: Row): number {
  const scale = row.subject.internal_only ? 100 : 60;
  if (row.marks.internalMax === 0) return 0;
  return (row.marks.internalObtained / row.marks.internalMax) * scale;
}

/** What a split subject needs in the end sem (/40) for a grade threshold. */
function externalNeeded(row: Row, threshold: number): number {
  return Math.max(0, threshold - internalScaled(row));
}

function GradeChips({
  value,
  onChange,
}: {
  value: Grade;
  onChange: (g: Grade) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {TARGET_GRADES.map(({ grade }) => {
        const active = grade === value;
        const color = GRADE_COLORS[grade];
        return (
          <button
            key={grade}
            onClick={() => onChange(grade)}
            aria-pressed={active}
            className={cn(
              "h-10 min-w-12 rounded-xl px-3 text-sm font-extrabold transition-all",
              active ? "scale-105" : "opacity-60 hover:opacity-100"
            )}
            style={{
              backgroundColor: active ? `${color}26` : "hsl(var(--surface-2))",
              color: active ? color : undefined,
              boxShadow: active ? `inset 0 0 0 1.5px ${color}` : undefined,
            }}
          >
            {grade}
          </button>
        );
      })}
    </div>
  );
}

function WhatDoINeedCard({ rows }: { rows: Row[] }) {
  const [subjectId, setSubjectId] = useState(rows[0]?.subject.id ?? "");
  const [mode, setMode] = useState<"external" | "internal">("external");
  const [grade, setGrade] = useState<Grade>("A+");
  const [expectedExt, setExpectedExt] = useState("30");

  const row = rows.find((r) => r.subject.id === subjectId) ?? rows[0];
  if (!row) return null;

  const threshold = GRADE_TABLE.find((g) => g.grade === grade)!.min;
  const isInternalOnly = !!row.subject.internal_only;
  const scaled = internalScaled(row);

  let verdict: React.ReactNode;
  if (isInternalOnly) {
    const pace = row.marks.hasAnyMarks ? row.marks.predictedTotal : null;
    verdict = (
      <div className="space-y-1">
        <p className="text-sm font-bold">
          No end sem — internals make the full <span className="tabular">/100</span>.
        </p>
        <p className="text-sm font-semibold text-muted">
          {grade} needs an internal average of ≥ {threshold}%.{" "}
          {pace === null
            ? "Add marks to see your pace."
            : pace >= threshold
              ? `You're on pace at ${pace.toFixed(1)}% — keep it up.`
              : `You're at ${pace.toFixed(1)}% — lift your remaining internals above ${threshold}%.`}
        </p>
      </div>
    );
  } else if (mode === "external") {
    const need = externalNeeded(row, threshold);
    verdict = (
      <div className="space-y-1">
        <p className="text-xs font-semibold text-muted">
          Internal scaled: <span className="tabular">{scaled.toFixed(1)}/60</span>
          {row.marks.internalMax === 0 && " (no internals entered yet)"}
        </p>
        {need > 40 ? (
          <p className="text-sm font-bold text-bad-deep">
            {grade} not reachable — would need {need.toFixed(1)}/40.
          </p>
        ) : need === 0 ? (
          <p className="text-sm font-bold text-good-deep">
            {grade} is already locked by your internals. 🎉
          </p>
        ) : (
          <p className="text-sm font-bold">
            You need ≥ <span className="tabular text-accent">{need.toFixed(1)}/40</span> in the
            end sem for {grade}.
          </p>
        )}
      </div>
    );
  } else {
    const ext = Math.max(0, Math.min(40, Number(expectedExt) || 0));
    const needInternal = Math.max(0, threshold - ext);
    verdict = (
      <div className="space-y-1">
        <p className="text-xs font-semibold text-muted">
          Assuming <span className="tabular">{ext.toFixed(0)}/40</span> in the end sem:
        </p>
        {needInternal > 60 ? (
          <p className="text-sm font-bold text-bad-deep">
            {grade} not reachable — would need {needInternal.toFixed(1)}/60 internals.
          </p>
        ) : needInternal === 0 ? (
          <p className="text-sm font-bold text-good-deep">
            {grade} is yours even with zero internals.
          </p>
        ) : (
          <p className="text-sm font-bold">
            You need ≥ <span className="tabular text-accent">{needInternal.toFixed(1)}/60</span>{" "}
            scaled internals (an average of {((needInternal / 60) * 100).toFixed(0)}%) for {grade}.
          </p>
        )}
      </div>
    );
  }

  return (
    <section className="card space-y-4 p-5">
      <p className="flex items-center gap-2 font-bold">
        <Calculator className="h-4 w-4 text-accent" /> What do I need?
      </p>

      <Field label="Subject">
        <Select value={row.subject.id} onChange={(e) => setSubjectId(e.target.value)}>
          {rows.map((r) => (
            <option key={r.subject.id} value={r.subject.id}>
              {r.subject.name}
            </option>
          ))}
        </Select>
      </Field>

      {!isInternalOnly && (
        <Segmented
          layoutId="calc-mode"
          options={[
            { value: "external", label: "Internals → External needed" },
            { value: "internal", label: "Set external → Internal needed" },
          ]}
          value={mode}
          onChange={(v) => setMode(v as "external" | "internal")}
        />
      )}

      {mode === "internal" && !isInternalOnly && (
        <Field label="Expected end sem (/40)">
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            max={40}
            value={expectedExt}
            onChange={(e) => setExpectedExt(e.target.value)}
          />
        </Field>
      )}

      <Field label="Pick a target grade">
        <GradeChips value={grade} onChange={setGrade} />
      </Field>

      <div className="rounded-2xl border bg-surface-2/40 p-3.5">{verdict}</div>
    </section>
  );
}

function TargetSgpaCard({ rows }: { rows: Row[] }) {
  const [target, setTarget] = useState("9.0");
  const creditRows = rows.filter((r) => r.subject.credits > 0);

  const t = Math.max(0, Math.min(10, Number(target) || 0));
  const needed = minGradeForPoints(t);

  return (
    <section className="card space-y-4 p-5">
      <p className="flex items-center gap-2 font-bold">
        <Target className="h-4 w-4 text-accent" /> Target SGPA
      </p>

      <Field label="Target SGPA">
        <Input
          type="number"
          inputMode="decimal"
          min={0}
          max={10}
          step={0.1}
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        />
      </Field>

      <p className="text-sm font-semibold text-muted">
        You need about <span className="tabular font-bold text-ink">{t.toFixed(2)}</span> points
        on average — that's at least{" "}
        {needed ? (
          <span className="font-bold" style={{ color: GRADE_COLORS[needed.grade] }}>
            {needed.grade}
          </span>
        ) : (
          <span className="font-bold text-bad-deep">more than an O (impossible)</span>
        )}{" "}
        in every subject.
      </p>

      {needed && (
        <div className="space-y-1.5">
          {creditRows.map((r) => {
            const isInternalOnly = !!r.subject.internal_only;
            const need = externalNeeded(r, needed.min);
            const impossible = !isInternalOnly && need > 40;
            return (
              <div
                key={r.subject.id}
                className="flex items-center justify-between gap-3 rounded-xl border bg-surface-2/30 px-3 py-2"
              >
                <p className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                  <Dot color={r.subject.color_hex} className="h-2 w-2" />
                  <span className="truncate">{r.subject.name}</span>
                </p>
                <p
                  className={cn(
                    "shrink-0 text-xs font-bold tabular",
                    impossible ? "text-bad-deep" : "text-muted"
                  )}
                >
                  {isInternalOnly
                    ? `${needed.grade} · avg ≥ ${needed.min}%`
                    : impossible
                      ? `${needed.grade} · ${need.toFixed(1)}/40 impossible`
                      : need === 0
                        ? `${needed.grade} · already locked`
                        : `${needed.grade} · ${need.toFixed(1)}/40 end sem`}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

interface CgpaRow {
  sgpa: string;
  credits: string;
}

const CGPA_KEY = "acadkit:cgpa";

function loadCgpaRows(): CgpaRow[] {
  try {
    const raw = JSON.parse(localStorage.getItem(CGPA_KEY) ?? "[]") as CgpaRow[];
    if (Array.isArray(raw) && raw.length === 8) return raw;
  } catch {
    /* fresh */
  }
  return Array.from({ length: 8 }, () => ({ sgpa: "", credits: "" }));
}

function CgpaCard() {
  const [rows, setRows] = useState<CgpaRow[]>(loadCgpaRows);

  useEffect(() => {
    localStorage.setItem(CGPA_KEY, JSON.stringify(rows));
  }, [rows]);

  const { cgpa, semesters } = useMemo(() => {
    let weighted = 0;
    let credits = 0;
    let count = 0;
    for (const r of rows) {
      const s = Number(r.sgpa);
      const c = Number(r.credits);
      if (r.sgpa !== "" && r.credits !== "" && s >= 0 && s <= 10 && c > 0) {
        weighted += s * c;
        credits += c;
        count++;
      }
    }
    return { cgpa: credits > 0 ? weighted / credits : null, semesters: count };
  }, [rows]);

  function update(i: number, key: keyof CgpaRow, value: string) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));
  }

  return (
    <section className="card space-y-4 p-5">
      <p className="flex items-center gap-2 font-bold">
        <TrendingUp className="h-4 w-4 text-accent" /> CGPA
      </p>

      <div className="flex items-center justify-between rounded-2xl border bg-surface-2/40 px-4 py-3">
        {cgpa === null ? (
          <p className="text-sm font-semibold text-muted">
            Enter SGPA and credits per semester
          </p>
        ) : (
          <>
            <p className="text-3xl font-extrabold tabular accent-gradient-text">
              <AnimatedNumber value={cgpa} decimals={2} />
            </p>
            <p className="text-xs font-semibold text-muted">
              across {semesters} semester{semesters === 1 ? "" : "s"}
            </p>
          </>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="grid grid-cols-[2.5rem_1fr_1fr] gap-2 px-1 text-[10px] font-bold uppercase tracking-widest text-muted">
          <span>Sem</span>
          <span>SGPA</span>
          <span>Credits</span>
        </div>
        {rows.map((row, i) => (
          <div key={i} className="grid grid-cols-[2.5rem_1fr_1fr] items-center gap-2">
            <span className="text-center text-sm font-bold text-muted">{i + 1}</span>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              max={10}
              step={0.01}
              placeholder="—"
              value={row.sgpa}
              onChange={(e) => update(i, "sgpa", e.target.value)}
              className="h-10 rounded-xl text-center text-sm"
            />
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              placeholder="—"
              value={row.credits}
              onChange={(e) => update(i, "credits", e.target.value)}
              className="h-10 rounded-xl text-center text-sm"
            />
          </div>
        ))}
      </div>
    </section>
  );
}

export function MarksCalculators({ rows }: { rows: Row[] }) {
  if (rows.length === 0) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 26 }}
      className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3"
    >
      <WhatDoINeedCard rows={rows} />
      <TargetSgpaCard rows={rows} />
      <CgpaCard />
    </motion.div>
  );
}
