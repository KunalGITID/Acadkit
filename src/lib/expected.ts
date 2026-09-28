import { labelMatchKey } from "@/lib/componentLabel";
import {
  assessmentFor,
  editableAssessment,
  inferType,
  solveSubjectPlan,
  type SolveOptions,
  type SolvedComponent,
  type SubjectPlan,
} from "@/lib/plan";
import { countsInSgpa, GRADE_TABLE } from "@/lib/grades";
import type { Assessment, ExpectedMark, Grade, Mark, Subject } from "@/types";

/** "I've sat it, the result isn't out, and I know roughly how it went." */

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
 * on it - the plan, the end-sem assumption - is touched by the write.
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

/** One subject's budget with your expectations counted. */
export function expectedOutlook(
  subject: Subject,
  marks: Mark[],
  targetGrade: Grade,
  options: SolveOptions = {}
): ExpectedOutlook {
  const stored = expectedFor(subject);
  // This subject's deadlines only. Handing every subject the whole list
  // adopted other courses' tests as its own - a subject with nothing
  // announced showed "21MAB201T Exam", "FT-2" and the rest of the term.
  options = {
    ...options,
    deadlines: (options.deadlines ?? []).filter((d) => d.subject_id === subject.id),
  };
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

export interface RealisedGrade {
  subjectId: string;
  grade: Grade;
  points: number;
  credits: number;
  /** Why this grade: the target you set, or what the maths allows instead. */
  basis: "target" | "final" | "best-reachable" | "barred";
}

/** "If my expected marks and my subject grades come true": each subject finishes at the grade you've set on its card, counted with the tests you are waiting on at what you expect. */
export function realisedSgpa(
  outlooks: { subject: Subject; targetGrade: Grade; plan: SubjectPlan; barred?: boolean }[]
): { sgpa: number | null; grades: RealisedGrade[]; changed: number } {
  const pointsOf = (g: Grade) => GRADE_TABLE.find((t) => t.grade === g)?.points ?? 0;
  const grades: RealisedGrade[] = outlooks
    .filter((o) => countsInSgpa(o.subject))
    .map(({ subject, targetGrade, plan, barred }) => {
      let grade: Grade = targetGrade;
      let basis: RealisedGrade["basis"] = "target";
      if (barred) {
        grade = plan.floorGrade;
        basis = "barred";
      } else if (plan.status === "final") {
        grade = plan.floorGrade;
        basis = "final";
      } else if (plan.status === "out-of-reach") {
        grade = plan.bestReachable ?? "F";
        basis = "best-reachable";
      }
      return { subjectId: subject.id, grade, points: pointsOf(grade), credits: subject.credits, basis };
    });
  const credits = grades.reduce((a, g) => a + g.credits, 0);
  return {
    sgpa: credits > 0 ? grades.reduce((a, g) => a + g.points * g.credits, 0) / credits : null,
    grades,
    changed: grades.filter((g) => g.basis !== "target").length,
  };
}
