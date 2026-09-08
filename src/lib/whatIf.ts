import { computeSgpa, normLabel } from "@/lib/plan";
import { gradeForTotal } from "@/lib/grades";
import type { Grade, Mark, MarkComponentType, Subject } from "@/types";

/**
 * "What if I get this?"
 *
 * The budget already answers what a test *has* to return. The question
 * people actually ask in front of it is the other direction — what
 * happens if I get twelve — and until now the only way to find out was
 * to type a fake mark in, read the numbers, and remember to delete it.
 * Which is a data-entry trap: the fake mark syncs to every device and
 * quietly poisons the projection it was supposed to explore.
 *
 * So the hypothetical is never written down. It is a mark injected into
 * a copy of your marks, run through the same solve the cards use, and
 * thrown away. Same maths, same assumptions, same answer — the point is
 * that it cannot disagree with the card it sits inside.
 */

export interface WhatIfOutcome {
  /** The mark being imagined. */
  obtained: number;
  /** The subject's /100 if it came in. */
  total: number;
  grade: Grade;
  points: number;
  /** Semester SGPA with it, or null when nothing counts yet. */
  sgpa: number | null;
}

export interface WhatIfComponent {
  label: string;
  type: MarkComponentType;
  max: number;
  /** The end-sem is external; everything else isn't. */
  isExternal?: boolean;
}

export interface WhatIfInput {
  subjects: Subject[];
  marksBySubject: Map<string, Mark[]>;
  subjectId: string;
  component: WhatIfComponent;
}

function synthetic(subjectId: string, c: WhatIfComponent, obtained: number): Mark {
  return {
    // Deliberately not a real id: nothing may mistake this for a row.
    id: `what-if:${subjectId}:${normLabel(c.label)}`,
    device_id: "",
    subject_id: subjectId,
    component_type: c.type,
    label: c.label,
    marks_obtained: obtained,
    max_marks: c.max,
    is_external: c.isExternal ?? false,
  };
}

/** The same solve the cards run, over marks that include the guess. */
function solve(
  { subjects, marksBySubject, subjectId, component }: WhatIfInput,
  injected: Mark | null
): { total: number; grade: Grade; points: number; sgpa: number | null } | null {
  const own = marksBySubject.get(subjectId);
  if (!subjects.some((s) => s.id === subjectId)) return null;

  const next = new Map(marksBySubject);
  if (injected) {
    // A component is one component: replacing any mark that already
    // carries this label keeps a hypothetical from being counted as a
    // second sitting of the same test.
    const label = normLabel(component.label);
    next.set(subjectId, [
      ...(own ?? []).filter((m) => normLabel(m.label) !== label),
      injected,
    ]);
  }

  const result = computeSgpa(subjects, next);
  const row = result.rows.find((r) => r.subject.id === subjectId);
  if (!row) return null;
  return {
    total: row.marks.predictedTotal,
    grade: row.marks.grade,
    points: row.marks.points,
    sgpa: result.sgpa,
  };
}

/** Where you stand before imagining anything. */
export function currentOutcome(input: WhatIfInput): WhatIfOutcome | null {
  const out = solve(input, null);
  return out ? { obtained: 0, ...out } : null;
}

export function whatIfMark(input: WhatIfInput, obtained: number): WhatIfOutcome | null {
  const clamped = Math.max(0, Math.min(input.component.max, obtained));
  const out = solve(input, synthetic(input.subjectId, input.component, clamped));
  return out ? { obtained: clamped, ...out } : null;
}

/**
 * The whole range, at half-mark steps.
 *
 * Marks are awarded in halves here — `ceilHalf` exists for exactly that
 * reason — so anything finer is a slider pretending to a precision the
 * marksheet doesn't have.
 */
export function whatIfRange(input: WhatIfInput, step = 0.5): WhatIfOutcome[] {
  const out: WhatIfOutcome[] = [];
  for (let m = 0; m <= input.component.max + 1e-9; m += step) {
    const point = whatIfMark(input, Math.round(m * 2) / 2);
    if (point) out.push(point);
  }
  return out;
}

/**
 * The cheapest mark that reaches each grade this component can still
 * produce, best grade first.
 *
 * This is the answer a slider is being dragged to find. "78 is a B+" is
 * a reading; "11.5 here is where this becomes an A" is a target, and it
 * is the only one of the two worth acting on.
 */
export function gradeThresholds(
  input: WhatIfInput,
  step = 0.5
): Array<{ grade: Grade; obtained: number; total: number }> {
  const cheapest = new Map<Grade, { grade: Grade; obtained: number; total: number }>();
  for (const point of whatIfRange(input, step)) {
    if (!cheapest.has(point.grade))
      cheapest.set(point.grade, {
        grade: point.grade,
        obtained: point.obtained,
        total: point.total,
      });
  }
  return [...cheapest.values()].sort((a, b) => b.total - a.total);
}

/** The grade a /100 lands in — re-exported so callers need one import. */
export { gradeForTotal };
