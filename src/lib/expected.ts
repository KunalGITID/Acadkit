import { labelMatchKey } from "@/lib/componentLabel";
import {
  assessmentFor,
  computeSgpa,
  editableAssessment,
  inferType,
  solveSubjectPlan,
  type SolveOptions,
  type SolvedComponent,
  type SubjectPlan,
} from "@/lib/plan";
import type { Assessment, ExpectedMark, Grade, Mark, Subject } from "@/types";

/**
 * "I've sat it, the result isn't out, and I know roughly how it went."
 *
 * Between writing a test and seeing its mark there is a week or three
 * in which the budget still reads that test as unplayed — so it keeps
 * asking FT-2 for eleven marks you already know you didn't get, and the
 * targets it hands FT-3 and FT-4 are spread across a pool that no
 * longer exists. The honest ask for the next test depends on the one
 * you just wrote.
 *
 * An expectation is not a result, so it is never written as a mark: the
 * Grades view, the Dashboard and the SGPA carry on reading only what has
 * been returned. It lives on the subject's assessment and is injected
 * into a copy of the marks here, the same way the what-if slider works,
 * so the targets below it come out of the solver every other screen uses.
 * Once the real mark lands it wins, and the expectation stays only to
 * show how far off it was.
 */

/** Stored expectations with anything unusable dropped. */
export function expectedFor(subject: Subject): Record<string, ExpectedMark> {
  const raw = assessmentFor(subject).expected ?? {};
  const out: Record<string, ExpectedMark> = {};
  for (const [key, e] of Object.entries(raw)) {
    if (!e || !Number.isFinite(e.obtained) || !Number.isFinite(e.max) || e.max <= 0) continue;
    out[key] = { obtained: Math.max(0, Math.min(e.max, e.obtained)), max: e.max };
  }
  return out;
}

/**
 * The assessment with one expectation set, or cleared with null.
 *
 * Spreads the stored object rather than rebuilding it, so nothing else
 * on it — the plan, the end-sem assumption — is touched by the write.
 */
export function setExpected(
  subject: Subject,
  label: string,
  value: ExpectedMark | null
): Assessment {
  const base = editableAssessment(subject.assessment, !!subject.internal_only);
  const next = { ...(base.expected ?? {}) };
  const key = labelMatchKey(label);
  if (value === null) delete next[key];
  else next[key] = value;
  return { ...base, expected: Object.keys(next).length ? next : null };
}

/** Components an expectation can stand in for: internal and still unmarked. */
function expectable(c: SolvedComponent): boolean {
  return c.obtained === null && c.max > 0 && (c.kind === "planned" || c.kind === "deadline");
}

function synthetic(subject: Subject, c: SolvedComponent, e: ExpectedMark): Mark {
  return {
    // Deliberately not a real id: nothing may mistake this for a row.
    id: `expected:${subject.id}:${labelMatchKey(c.label)}`,
    device_id: "",
    subject_id: subject.id,
    component_type: inferType(c.label),
    label: c.label,
    // Rescaled onto the component's current weight, so an expectation
    // typed as 12/15 still means 80% if the plan is later rescaled.
    marks_obtained: (e.obtained / e.max) * c.max,
    max_marks: c.max,
    is_external: false,
  };
}

export type ExpectedRowState =
  /** Returned. `expected` is what you had guessed, if you had. */
  | "graded"
  /** Sat, not returned, and you've said how it went. */
  | "expected"
  /** Still to come: the row carries the target for it. */
  | "open"
  /** The end-sem, which has its own assumption field. */
  | "external"
  /** Internal weight nobody has announced yet. */
  | "unannounced";

export interface ExpectedRow {
  component: SolvedComponent;
  state: ExpectedRowState;
  expected: ExpectedMark | null;
}

export interface ExpectedOutlook {
  /** The solve with every expectation counted as though it were in. */
  plan: SubjectPlan;
  /** The same solve on returned marks only, for "what changed". */
  actual: SubjectPlan;
  rows: ExpectedRow[];
  /** Expectations currently standing in for a mark. */
  pending: number;
}

/**
 * One subject's budget with your expectations counted.
 *
 * Solved twice: once on returned marks to find which components are
 * still open, then again with the expectations for those injected. An
 * expectation whose component has since been renamed away, or already
 * marked, is ignored rather than adopted as an extra component — a
 * stale guess must not start counting as a test of its own.
 */
export function expectedOutlook(
  subject: Subject,
  marks: Mark[],
  targetGrade: Grade,
  options: SolveOptions = {}
): ExpectedOutlook {
  const stored = expectedFor(subject);
  const actual = solveSubjectPlan(subject, marks, targetGrade, options);

  const injected: Mark[] = [];
  for (const c of actual.components) {
    const e = stored[labelMatchKey(c.label)];
    if (e && expectable(c)) injected.push(synthetic(subject, c, e));
  }
  const standing = new Set(injected.map((m) => labelMatchKey(m.label)));

  const plan = injected.length
    ? solveSubjectPlan(subject, [...marks, ...injected], targetGrade, options)
    : actual;

  const rows: ExpectedRow[] = plan.components.map((c) => {
    const key = labelMatchKey(c.label);
    const expected = stored[key] ?? null;
    if (c.kind === "external") return { component: c, state: "external", expected: null };
    if (c.kind === "unannounced") return { component: c, state: "unannounced", expected: null };
    if (standing.has(key)) return { component: c, state: "expected", expected };
    if (c.obtained !== null) return { component: c, state: "graded", expected };
    return { component: c, state: "open", expected: null };
  });

  return { plan, actual, rows, pending: injected.length };
}

/**
 * SGPA at your pace, on returned marks and again with expectations in.
 *
 * Same `computeSgpa` the Dashboard reads, so the first number is the one
 * it shows and the second is what it will show if the tests you've sat
 * come back the way you think.
 */
export function expectedSgpa(
  subjects: Subject[],
  marksBySubject: Map<string, Mark[]>,
  options: SolveOptions = {}
): { now: number | null; expected: number | null; pending: number } {
  const withExpected = new Map(marksBySubject);
  let pending = 0;
  for (const subject of subjects) {
    const marks = marksBySubject.get(subject.id) ?? [];
    const { rows } = expectedOutlook(subject, marks, "O", options);
    const extra = rows
      .filter((r) => r.state === "expected" && r.expected)
      .map((r) => synthetic(subject, r.component, r.expected!));
    if (extra.length) {
      pending += extra.length;
      withExpected.set(subject.id, [...marks, ...extra]);
    }
  }
  return {
    now: computeSgpa(subjects, marksBySubject).sgpa,
    expected: computeSgpa(subjects, withExpected).sgpa,
    pending,
  };
}
