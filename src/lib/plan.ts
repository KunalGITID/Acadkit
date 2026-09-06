/**
 * The assessment-budget engine.
 *
 * The older model (`computeSubjectMarks`) reads a subject as a *rate*:
 * whatever fraction of the entered components you've earned, projected
 * onto /100. One 5/5 assignment therefore reads as 100% — "on pace for
 * O" — and the same subject reads F the moment a 2/15 lands. Both are
 * artefacts of a denominator that only counts what has already been
 * marked.
 *
 * This model reads a subject as a *budget* instead. A course is 100
 * marks split between internals and an end-sem; every one of those
 * marks either has been played or is still to come. 5/5 on an
 * assignment banks 5 of 100 and leaves 95 on the table — so a target
 * isn't a pace to hold, it's a number to cover with what's left.
 *
 * Two facts about SRM drive the shape:
 *
 * **The split is not fixed.** 60/40 is typical, not universal; some
 * subjects are wholly internal, others weight the end-sem harder. So
 * the internal weight is per-subject, and everything here is written
 * against W rather than a literal 60.
 *
 * **The component plan arrives late, or never.** Some faculty hand out
 * the full breakdown in week one; others announce a test a week before
 * it happens. So a plan is *partial by default*: declared components
 * take their share of W, and whatever is left over stays a single
 * unannounced bucket that shrinks as components get declared. A subject
 * with no plan at all still solves — it just answers in one lump
 * instead of per test.
 */
import { GRADE_TABLE, gradeForTotal } from "@/lib/grades";
import type {
  Assessment,
  Grade,
  Mark,
  MarkComponentType,
  PlannedComponent,
  Subject,
} from "@/types";

/** Both shapes live on the types leaf; re-exported for callers' convenience. */
export type { Assessment, PlannedComponent };

export const DEFAULT_INTERNAL_WEIGHT = 60;

/** Marks are awarded in halves; 12.1 needed means 12 is not enough. */
export function ceilHalf(n: number): number {
  const v = Math.ceil(n * 2 - 1e-9) / 2;
  // The epsilon turns an exact 0 into -0, which prints the same but
  // fails an Object.is check and reads badly as a React key.
  return v === 0 ? 0 : v;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * A mark as a share of what it's worth in the budget.
 *
 * Every raw number from the database passes through here, because all
 * three ways it can be wrong are things real data does:
 *
 *  - **Not a number.** One NaN in one component otherwise propagates
 *    into banked, the pool, every required mark and the SGPA.
 *  - **Above the maximum.** Bonus marks exist, but a component worth 15
 *    of the internal 60 cannot bank 18 of them — the budget has to add
 *    up to 100 or none of the arithmetic above means anything.
 *  - **Below zero.** No component takes marks away from you.
 */
function share(obtained: number, max: number, weight: number): number {
  if (!Number.isFinite(obtained) || !Number.isFinite(max) || max <= 0) return 0;
  return clamp(obtained / max, 0, 1) * weight;
}

/** Labels match case- and space-insensitively: "CT-1" ≡ "ct 1". */
function normLabel(s: string): string {
  return s.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

/**
 * A subject's assessment, with every older shape filled in.
 *
 * `internal_only` predates this file (migration 008) and is still the
 * only structure signal on subjects that haven't been touched since, so
 * it maps onto a 100/0 weight rather than being read separately.
 */
export function assessmentFor(subject: Subject): Assessment {
  const raw = subject.assessment;
  const fallback = subject.internal_only ? 100 : DEFAULT_INTERNAL_WEIGHT;
  const declared = Number(raw?.internal);
  // A weight that isn't a number falls back rather than turning every
  // total on the card into NaN. jsonb is checked in migration 021, but
  // a stale row or a hand-edited one still has to land somewhere sane.
  const internal = clamp(Number.isFinite(declared) ? declared : fallback, 0, 100);
  return {
    internal,
    complete: raw?.complete ?? false,
    components: (raw?.components ?? []).filter(
      (c) => c && Number.isFinite(c.max) && c.max > 0
    ),
  };
}

/**
 * A component's type, read off its label.
 *
 * Saves a control in the plan editor: "CT-2" is a CT, "Lab eval 1" is a
 * Lab. Only ever cosmetic — nothing in the solve branches on type — so
 * guessing wrong costs an icon, not a number.
 */
export function inferType(label: string): MarkComponentType {
  const l = label.toLowerCase();
  if (l.includes("lab") || l.includes("prac")) return "Lab";
  if (l.includes("assign") || l.includes("hw") || l.includes("home")) return "Assignment";
  if (l.includes("project") || l.includes("mini")) return "Project";
  return "CT";
}

/**
 * A subject's assessment as the editor should show it, old shapes
 * filled in.
 *
 * Unlike `assessmentFor` this keeps zero-weight rows: in the editor a
 * blank row is something you are in the middle of typing, not a
 * component to discard.
 */
export function editableAssessment(
  assessment: Assessment | null | undefined,
  internalOnly: boolean
): Assessment {
  return (
    assessment ?? {
      internal: internalOnly ? 100 : DEFAULT_INTERNAL_WEIGHT,
      complete: false,
      components: [],
    }
  );
}

export type ComponentKind =
  /** Declared in the plan, or graded and matched to a declared row. */
  | "planned"
  /** Graded but not in the plan — it happened, so it counts regardless. */
  | "extra"
  /** The internal marks that exist but haven't been announced yet. */
  | "unannounced"
  /** The end-sem. */
  | "external";

export interface SolvedComponent {
  key: string;
  label: string;
  type: MarkComponentType;
  kind: ComponentKind;
  /** Weight of this component in /100 terms, after any scaling. */
  max: number;
  /** /100 marks earned, or null if it hasn't been graded yet. */
  obtained: number | null;
  /** Exact marks needed here to hit the target; null once graded. */
  required: number | null;
  /**
   * Required as a share of `max`, for a bar. Can exceed 100 when the
   * target has moved out of reach.
   */
  requiredPct: number | null;
}

export interface GradeRequirement {
  grade: Grade;
  points: number;
  /** Total /100 this grade starts at. */
  minTotal: number;
  /** Share of every remaining mark needed, 0–1. Null when nothing is left. */
  rate: number | null;
  /** Marks needed out of everything remaining. Negative means banked. */
  needed: number;
  /** Holds even scoring zero on everything left. */
  secured: boolean;
  /** Still reachable with full marks on everything left. */
  achievable: boolean;
}

export type PlanStatus =
  /** Target holds even at zero from here. */
  | "locked"
  /** Reachable, and you're already scoring above the required rate. */
  | "on-track"
  /** Reachable, but it needs more than you've averaged so far. */
  | "push"
  /** Full marks on everything left still falls short. */
  | "out-of-reach"
  /** Nothing left to play for. */
  | "final";

export interface SubjectPlan {
  subject: Subject;
  internalWeight: number;
  externalWeight: number;
  /** /100 secured so far — the floor. */
  banked: number;
  /** Internal weight already played out. */
  gradedMax: number;
  remainingInternal: number;
  /** Everything still to play for: remaining internals + end-sem. */
  pool: number;
  target: { grade: Grade; points: number; minTotal: number };
  /** Marks still needed for the target. Negative means banked already. */
  needed: number;
  /** Share of every remaining mark the target implies, 0–1. */
  requiredRate: number | null;
  status: PlanStatus;
  components: SolvedComponent[];
  /** Score zero on everything left. */
  floor: number;
  /** Ace everything left. */
  ceiling: number;
  /** Keep scoring at the rate you've managed so far. */
  pace: number | null;
  paceRate: number | null;
  floorGrade: Grade;
  ceilingGrade: Grade;
  paceGrade: Grade | null;
  /** Best grade still reachable, null if even C is gone. */
  bestReachable: Grade | null;
  /** Marks you could still drop and hold the target. Null if unreachable. */
  slack: number | null;
  /** Plan overflowed the internal weight and was scaled down to fit. */
  scaled: boolean;
  perGrade: GradeRequirement[];
  hasAnyMarks: boolean;
}

/** The grade a target SGPA implies, for subjects with no explicit target. */
export function gradeForTargetSgpa(targetSgpa: number): Grade {
  // Settings can only hold a number, but a rehydrated cache or a hand
  // -edited row can hold anything; 8.5 is what the app defaults to.
  const t = Number.isFinite(targetSgpa) ? targetSgpa : 8.5;
  const wanted = Math.ceil(t - 1e-9);
  const row = [...GRADE_TABLE]
    .filter((g) => g.grade !== "F")
    .reverse()
    .find((g) => g.points >= wanted);
  return row?.grade ?? "O";
}

function gradeRow(grade: Grade) {
  return GRADE_TABLE.find((g) => g.grade === grade) ?? GRADE_TABLE[GRADE_TABLE.length - 1];
}

/**
 * Solve one subject against a target grade.
 *
 * The spread rule is equal effort: every remaining component — the
 * end-sem included — is asked for the same share of its own marks.
 * It's the only rule that re-solves cleanly, because after each result
 * lands the same question is simply asked of a smaller pool.
 */
/**
 * A subject's budget, before any target is applied.
 *
 * Split out because the same arithmetic answers two different
 * questions. "What will I get" (the Dashboard dial, the SGPA, the Marks
 * page) depends only on what has been banked and what is left; "what do
 * I need for an A" adds a threshold on top. Deriving both from one
 * function is what stops the Dashboard and Insights disagreeing about
 * the same subject, which is exactly what happened while the two pages
 * ran different models.
 */
export interface SubjectBudget {
  internalWeight: number;
  externalWeight: number;
  components: SolvedComponent[];
  /** /100 secured so far — the floor. */
  banked: number;
  gradedMax: number;
  remainingInternal: number;
  /** Everything still to play for: remaining internals + end-sem. */
  pool: number;
  ceiling: number;
  /** Share of what's been played that you've actually taken, 0–1. */
  paceRate: number | null;
  /** /100 if you keep scoring at that share. Null with nothing graded. */
  pace: number | null;
  scaled: boolean;
  hasAnyMarks: boolean;
}

export function budgetFor(subject: Subject, marks: Mark[]): SubjectBudget {
  const assessment = assessmentFor(subject);
  const internalWeight = assessment.internal;
  const externalWeight = 100 - internalWeight;

  const usable = (m: Mark) => Number.isFinite(m.max_marks) && m.max_marks > 0;
  const internalMarks = marks.filter((m) => !m.is_external && usable(m));

  // Summed, not picked: a portal that splits the end-sem into parts
  // (theory + practical) reports two rows, and taking whichever came
  // back first would silently discard half the paper.
  const externalMarks = marks.filter((m) => m.is_external && usable(m));
  const externalObtained = externalMarks.reduce((s, m) => s + (Number.isFinite(m.marks_obtained) ? m.marks_obtained : 0), 0);
  const externalMax = externalMarks.reduce((s, m) => s + m.max_marks, 0);

  // ---- match graded marks onto declared rows ----
  const used = new Set<string>();
  const byLabel = new Map<string, Mark>();
  for (const m of internalMarks) {
    const k = normLabel(m.label);
    if (!byLabel.has(k)) byLabel.set(k, m);
  }

  interface Raw {
    key: string;
    label: string;
    type: MarkComponentType;
    kind: ComponentKind;
    max: number;
    obtained: number | null;
  }
  const raw: Raw[] = [];

  for (const c of assessment.components) {
    const hit = byLabel.get(normLabel(c.label));
    if (hit && !used.has(hit.id)) {
      used.add(hit.id);
      // The declared weight wins over what the mark says it was out of:
      // the plan is the contract, the mark is one reading of it.
      raw.push({
        key: c.key,
        label: c.label,
        type: c.type,
        kind: "planned",
        max: c.max,
        obtained: share(hit.marks_obtained, hit.max_marks, c.max),
      });
    } else {
      raw.push({ key: c.key, label: c.label, type: c.type, kind: "planned", max: c.max, obtained: null });
    }
  }

  // Graded components nobody declared. They happened; they count.
  for (const m of internalMarks) {
    if (used.has(m.id)) continue;
    raw.push({
      key: `mark:${m.id}`,
      label: m.label,
      type: m.component_type,
      kind: "extra",
      max: m.max_marks,
      obtained: share(m.marks_obtained, m.max_marks, m.max_marks),
    });
  }

  // ---- fit the declared internals onto the internal weight ----
  const declaredMax = raw.reduce((s, c) => s + c.max, 0);
  let scale = 1;
  let scaled = false;
  if (declaredMax > internalWeight + 1e-9) {
    // Overflow: the components describe the subject in their own units
    // (or the plan is over-filled). Preserve every ratio, fit the weight.
    scale = internalWeight / declaredMax;
    scaled = true;
  } else if (assessment.complete && declaredMax > 0 && declaredMax < internalWeight - 1e-9) {
    // Declared complete but short — same scaling, opposite direction.
    scale = internalWeight / declaredMax;
    scaled = true;
  }

  const components: SolvedComponent[] = raw.map((c) => ({
    key: c.key,
    label: c.label,
    type: c.type,
    kind: c.kind,
    max: c.max * scale,
    obtained: c.obtained === null ? null : c.obtained * scale,
    required: null,
    requiredPct: null,
  }));

  // ---- whatever internal weight nobody has claimed ----
  const claimed = components.reduce((s, c) => s + c.max, 0);
  const unannounced = internalWeight - claimed;
  if (unannounced > 0.01) {
    components.push({
      key: "unannounced",
      label: "Internals not yet announced",
      type: "CT",
      kind: "unannounced",
      max: unannounced,
      obtained: null,
      required: null,
      requiredPct: null,
    });
  }

  // ---- the end-sem ----
  if (externalWeight > 0.01) {
    components.push({
      key: "external",
      label: "End semester",
      type: "External",
      kind: "external",
      max: externalWeight,
      obtained:
        externalMarks.length > 0
          ? share(externalObtained, externalMax, externalWeight)
          : null,
      required: null,
      requiredPct: null,
    });
  }

  // ---- the budget ----
  const graded = components.filter((c) => c.obtained !== null);
  const pending = components.filter((c) => c.obtained === null);
  const banked = graded.reduce((s, c) => s + (c.obtained ?? 0), 0);
  const gradedMax = graded.reduce((s, c) => s + c.max, 0);
  const gradedInternalMax = graded
    .filter((c) => c.kind !== "external")
    .reduce((s, c) => s + c.max, 0);
  const remainingInternal = Math.max(0, internalWeight - gradedInternalMax);
  const pool = pending.reduce((s, c) => s + c.max, 0);

  const paceRate = gradedMax > 1e-9 ? banked / gradedMax : null;

  return {
    internalWeight,
    externalWeight,
    components,
    banked,
    gradedMax,
    remainingInternal,
    pool,
    ceiling: banked + pool,
    paceRate,
    pace: paceRate === null ? null : banked + paceRate * pool,
    scaled,
    hasAnyMarks: graded.length > 0,
  };
}

/**
 * A subject's outlook with no target involved: where your current rate
 * lands you, and the bracket around it.
 *
 * This is what every screen outside Insights needs. It replaced
 * `computeSubjectMarks`, which read a subject as earned-over-entered
 * and so called one 5/5 assignment a predicted O.
 */
export interface SubjectOutlook extends SubjectBudget {
  /** Raw internal sums as entered, for "22/30"-style display. */
  internalObtained: number;
  internalMax: number;
  internalComponents: Mark[];
  /** /100 at your current rate; the floor when nothing is graded yet. */
  predictedTotal: number;
  grade: Grade;
  points: number;
}

export function subjectOutlook(subject: Subject, marks: Mark[]): SubjectOutlook {
  const budget = budgetFor(subject, marks);
  const internalComponents = marks.filter((m) => !m.is_external);
  const predictedTotal = budget.pace ?? budget.banked;
  const { grade, points } = gradeForTotal(predictedTotal);
  return {
    ...budget,
    internalComponents,
    internalObtained: internalComponents.reduce(
      (s, m) => s + (Number.isFinite(m.marks_obtained) ? m.marks_obtained : 0),
      0
    ),
    internalMax: internalComponents.reduce(
      (s, m) => s + (Number.isFinite(m.max_marks) ? m.max_marks : 0),
      0
    ),
    predictedTotal,
    grade,
    points,
  };
}

export interface SgpaResult {
  sgpa: number | null;
  totalCredits: number;
  countedSubjects: number;
  rows: Array<{ subject: Subject; marks: SubjectOutlook }>;
  /** Raw internal sums across all subjects, e.g. 22/30. */
  totalObtained: number;
  totalMax: number;
}

/**
 * Predicted SGPA = Σ(points × credits) / Σcredits over credit-bearing
 * subjects with at least one mark. 0-credit (audit) subjects never count.
 *
 * The points are budget-derived now, so this is the same number
 * Insights shows rather than a second opinion.
 */
export function computeSgpa(
  subjects: Subject[],
  marksBySubject: Map<string, Mark[]>
): SgpaResult {
  const rows = subjects.map((subject) => ({
    subject,
    marks: subjectOutlook(subject, marksBySubject.get(subject.id) ?? []),
  }));
  const counted = rows.filter((r) => r.subject.credits > 0 && r.marks.hasAnyMarks);
  const totalCredits = counted.reduce((s, r) => s + r.subject.credits, 0);
  const weighted = counted.reduce((s, r) => s + r.marks.points * r.subject.credits, 0);
  return {
    sgpa: totalCredits > 0 ? weighted / totalCredits : null,
    totalCredits,
    countedSubjects: counted.length,
    rows,
    totalObtained: rows.reduce((s, r) => s + r.marks.internalObtained, 0),
    totalMax: rows.reduce((s, r) => s + r.marks.internalMax, 0),
  };
}

export function solveSubjectPlan(
  subject: Subject,
  marks: Mark[],
  targetGrade: Grade
): SubjectPlan {
  const target = gradeRow(targetGrade === "F" ? "C" : targetGrade);

  const {
    internalWeight,
    externalWeight,
    components,
    banked,
    gradedMax,
    remainingInternal,
    pool,
    ceiling,
    paceRate,
    pace,
    scaled,
    hasAnyMarks,
  } = budgetFor(subject, marks);

  const needed = target.min - banked;
  const requiredRate = pool > 1e-9 ? needed / pool : null;

  // The equal-effort spread: every component still in play is asked for
  // the same share of its own marks.
  for (const c of components) {
    if (c.obtained !== null) continue;
    c.required = requiredRate === null ? null : Math.max(0, requiredRate) * c.max;
    c.requiredPct = c.required === null || c.max <= 0 ? null : (c.required / c.max) * 100;
  }

  const floor = banked;

  let status: PlanStatus;
  if (pool <= 1e-9) status = "final";
  else if (needed <= 1e-9) status = "locked";
  else if (needed > pool + 1e-9) status = "out-of-reach";
  else if (paceRate !== null && requiredRate !== null && paceRate >= requiredRate - 1e-9)
    status = "on-track";
  else status = "push";

  const perGrade: GradeRequirement[] = GRADE_TABLE.filter((g) => g.grade !== "F").map((g) => {
    const need = g.min - banked;
    return {
      grade: g.grade,
      points: g.points,
      minTotal: g.min,
      rate: pool > 1e-9 ? need / pool : null,
      needed: need,
      secured: need <= 1e-9,
      achievable: need <= pool + 1e-9,
    };
  });

  const bestReachable = perGrade.find((g) => g.achievable)?.grade ?? null;

  return {
    subject,
    internalWeight,
    externalWeight,
    banked,
    gradedMax,
    remainingInternal,
    pool,
    target: { grade: target.grade, points: target.points, minTotal: target.min },
    needed,
    requiredRate,
    status,
    components,
    floor,
    ceiling,
    pace,
    paceRate,
    floorGrade: gradeForTotal(floor).grade,
    ceilingGrade: gradeForTotal(ceiling).grade,
    paceGrade: pace === null ? null : gradeForTotal(pace).grade,
    bestReachable,
    slack: ceiling >= target.min - 1e-9 ? ceiling - target.min : null,
    scaled,
    perGrade,
    hasAnyMarks,
  };
}
