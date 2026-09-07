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
import { todayISO } from "@/lib/dates";
import { GRADE_TABLE, gradeForTotal } from "@/lib/grades";
import type {
  Assessment,
  Deadline,
  Grade,
  Mark,
  MarkComponentType,
  PlannedComponent,
  Subject,
} from "@/types";

/** Both shapes live on the types leaf; re-exported for callers' convenience. */
export type { Assessment, PlannedComponent };

export const DEFAULT_INTERNAL_WEIGHT = 60;

/**
 * Rounding has a direction, and it is not the same in both places.
 *
 * A number you must *reach* rounds up — 12.1 needed means 12 is not
 * enough. A number you already *hold* rounds down — banking 42.4 and
 * calling it 42.5 hands you half a mark you did not earn, and the same
 * mistake at a grade boundary reads as a grade you do not have.
 *
 * Totals out of 100 use `floorTotal` for the same reason: grade
 * thresholds are integers, so `Math.floor(total) >= min` is true
 * exactly when `total >= min`. Flooring can therefore never disagree
 * with the grade printed beside it, and rounding demonstrably can —
 * 70.6 rounds to 71 and sits next to a B+.
 */
export function floorHalf(n: number): number {
  const v = Math.floor(n * 2 + 1e-9) / 2;
  return v === 0 ? 0 : v;
}

/** A /100 total, floored so it can never contradict its own grade. */
export function floorTotal(n: number): number {
  return Math.floor(n + 1e-9);
}

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
    assumedExternalPct: raw?.assumedExternalPct ?? null,
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
      assumedExternalPct: null,
    }
  );
}

export type ComponentKind =
  /** Declared in the plan, or graded and matched to a declared row. */
  | "planned"
  /** Graded but not in the plan — it happened, so it counts regardless. */
  | "extra"
  /** Announced in Deadlines with a mark value, not in the plan. */
  | "deadline"
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
  /**
   * What this component is being *assumed* to return rather than solved
   * for. Only ever set on the end-sem, and only when you have told the
   * app what to expect of it.
   */
  assumed: number | null;
  /**
   * Dated, still ungraded, and the date has passed — the test happened
   * and its marks aren't in yet.
   */
  overdue: boolean;
  /**
   * When this component happens, if a deadline says so. The plan
   * carries weights; the deadlines table carries dates, and a list of
   * what each test owes is far more useful in the order they arrive.
   */
  date: string | null;
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
  /**
   * Marks the end-sem is being assumed to return, when you've said what
   * to expect of it. Null means it is solved for like everything else.
   */
  assumedExternal: number | null;
  /** ±1 SD of your own component scores, or null with too few to say. */
  band: ConfidenceBand | null;
  /** The soonest dated component still to come. */
  next: SolvedComponent | null;
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
  /**
   * How much your results actually vary, and what that does to the
   * forecast. A single pace line quietly assumes you will reproduce
   * your average exactly; anyone with a 14/15 and a 2/15 knows that is
   * not a forecast, it is an average pretending to be one.
   */
  band: ConfidenceBand | null;
  /** The soonest dated component still to come. */
  next: SolvedComponent | null;
}

/** ±1 standard deviation of your own component scores, on the pool. */
export interface ConfidenceBand {
  /** Pace minus a deviation, floored at what's already banked. */
  low: number;
  /** Pace plus a deviation, capped at the ceiling. */
  high: number;
  /** Spread of your component ratios, 0–1. */
  sd: number;
  /** Graded components it was measured over. */
  samples: number;
}

/** Below this a "spread" is one result disagreeing with another. */
const MIN_BAND_SAMPLES = 3;

/**
 * Titles that mean the end-sem rather than an internal component.
 *
 * A deadline called "End sem" is the exam the external weight already
 * models, so adopting it as an internal component would count the paper
 * twice and inflate the internal side by its own marks. It still gets
 * its date, through the ordinary name match against the "End semester"
 * component.
 */
const EXTERNAL_ALIASES = new Set([
  "endsem",
  "endsems",
  "endsemester",
  "endsemexam",
  "endsemesterexam",
  "endsemesterexamination",
  "endsemesterexamination",
  "finalexam",
  "final",
  "semexam",
  "semesterexam",
  "external",
  "theoryexam",
]);

/**
 * Match deadlines onto components, then adopt the rest.
 *
 * Matching is by name, and only by name. An earlier version also
 * paired on weight where it was unambiguous on both sides, to date a
 * planned component from a differently-named deadline — but once
 * leftovers are adopted that trade stops being worth making. "Surprise
 * quiz, 5 marks" and a planned "Assignment, 5 marks" are not the same
 * test, and guessing they are loses the quiz from the budget *and*
 * puts a wrong date on the assignment. Adopting instead can only
 * over-count, which shows up as two rows you can merge by renaming one.
 * Between a silent error and a visible one, take the visible one.
 *
 * Whatever matches nothing becomes a component. You already record
 * every exam in Deadlines, and the optional "out of" field is exactly
 * the weight the budget wants, so a test announced late and typed in
 * once should not have to be typed again into the assessment plan.
 * Anything already graded, and anything named like the end-sem, is left
 * alone — the first has happened, and the second is the external weight
 * the budget already models.
 */
function claimDeadlines(
  raw: Array<{ label: string; max: number; obtained: number | null; date: string | null; key: string; type: MarkComponentType; kind: ComponentKind }>,
  deadlines: Deadline[],
  internalMarks: Mark[]
): void {
  // A date alone is enough to date a component you already planned.
  // Becoming a component in its own right takes a weight as well —
  // there is nothing to budget without one.
  const dated = deadlines.filter((d) => d.due_date);
  if (dated.length === 0) return;
  const weighed = dated.filter(
    (d) => Number.isFinite(Number(d.max_marks)) && Number(d.max_marks) > 0
  );


  const taken = new Set<string>();
  const pending = () => raw.filter((c) => c.obtained === null);

  // 1. By name — the only pairing you control directly.
  for (const c of pending()) {
    const hit = dated.find((d) => !taken.has(d.id) && normLabel(d.title) === normLabel(c.label));
    if (hit) {
      taken.add(hit.id);
      c.date = hit.due_date.slice(0, 10);
    }
  }

  // 2. Adopt the leftovers.
  const graded = new Set(internalMarks.map((m) => normLabel(m.label)));
  for (const d of weighed) {
    if (taken.has(d.id)) continue;
    const key = normLabel(d.title);
    if (graded.has(key) || EXTERNAL_ALIASES.has(key)) continue;
    if (raw.some((c) => normLabel(c.label) === key)) continue;
    raw.push({
      key: `deadline:${d.id}`,
      label: d.title,
      type: inferType(d.title),
      kind: "deadline",
      max: Number(d.max_marks),
      obtained: null,
      date: d.due_date.slice(0, 10),
    });
  }
}

/**
 * The spread of your own component scores.
 *
 * Population deviation over each graded component's ratio, which is the
 * right unit: a 2/15 and a 14/15 are 13% and 93%, and it is that gap —
 * not the raw marks — that says how much a single pace line should be
 * trusted. Below three components there is no spread worth reporting,
 * only two numbers disagreeing.
 */
function confidenceBand(
  components: SolvedComponent[],
  banked: number,
  pool: number,
  paceRate: number | null
): ConfidenceBand | null {
  if (paceRate === null || pool <= 1e-9) return null;
  const ratios = components
    .filter((c) => c.obtained !== null && c.max > 1e-9)
    .map((c) => (c.obtained as number) / c.max);
  if (ratios.length < MIN_BAND_SAMPLES) return null;

  const mean = ratios.reduce((a, r) => a + r, 0) / ratios.length;
  const variance = ratios.reduce((a, r) => a + (r - mean) ** 2, 0) / ratios.length;
  const sd = Math.sqrt(variance);

  return {
    low: banked + clamp(paceRate - sd, 0, 1) * pool,
    high: banked + clamp(paceRate + sd, 0, 1) * pool,
    sd,
    samples: ratios.length,
  };
}

export function budgetFor(
  subject: Subject,
  marks: Mark[],
  deadlines: Deadline[] = [],
  today: string = todayISO()
): SubjectBudget {
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
    date: string | null;
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
        date: null,
      });
    } else {
      raw.push({
        key: c.key,
        label: c.label,
        type: c.type,
        kind: "planned",
        max: c.max,
        obtained: null,
        date: null,
      });
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
      date: null,
    });
  }

  // Deadlines, in one pass: date the components they clearly refer to,
  // then adopt whatever is left over as components of its own.
  //
  // The order matters. Matching first means a test that is both planned
  // and logged stays one component with a date on it; adopting first
  // would make it two, and count the same paper twice. Adopting the
  // leftovers means a test announced last week and typed into Deadlines
  // shows up in the budget without being typed again into the plan —
  // the deadline *is* the announcement.
  claimDeadlines(raw, deadlines, internalMarks);

  // ---- fit the declared internals onto the internal weight ----  // ---- fit the declared internals onto the internal weight ----
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
    assumed: null,
    date: c.date,
    overdue: c.date !== null && c.date < today,
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
      assumed: null,
      date: null,
      overdue: false,
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
      assumed: null,
      date: null,
      overdue: false,
    });
  }

  // The end-sem is built after the internal pass, so it takes its date
  // here — from a deadline named like one.
  const external = components.find((c) => c.kind === "external");
  if (external) {
    const hit = deadlines.find(
      (d) =>
        d.due_date &&
        (EXTERNAL_ALIASES.has(normLabel(d.title)) ||
          normLabel(d.title) === normLabel(external.label))
    );
    if (hit) {
      external.date = hit.due_date.slice(0, 10);
      external.overdue = external.date < today;
    }
  }

  // Keys become React keys downstream, and a plan can carry duplicates
  // — jsonb edited by hand, or a row copied in the editor. Deduping
  // here rather than in the card keeps every consumer safe.
  const seenKeys = new Set<string>();
  for (const c of components) {
    let key = c.key;
    for (let i = 2; seenKeys.has(key); i++) key = `${c.key}#${i}`;
    c.key = key;
    seenKeys.add(key);
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
  // "Next" means next, so a date that has already passed is not a
  // candidate however soon it once was. A test sat last week with its
  // marks not yet entered is still owed — it stays in the list, flagged
  // overdue — but announcing it as what is coming up is just wrong.
  const upcoming = components
    .filter((c) => c.obtained === null && c.date !== null && c.date >= today)
    .sort((a, b) => (a.date as string).localeCompare(b.date as string));

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
    band: confidenceBand(components, banked, pool, paceRate),
    next: upcoming[0] ?? null,
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

export function subjectOutlook(
  subject: Subject,
  marks: Mark[],
  deadlines: Deadline[] = [],
  today: string = todayISO()
): SubjectOutlook {
  const budget = budgetFor(subject, marks, deadlines, today);
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

/**
 * Options that change what a target *costs*, not what you have.
 */
export interface SolveOptions {
  deadlines?: Deadline[];
  /** Reference date for "next" and "overdue". Defaults to today. */
  today?: string;
  /**
   * What you expect the end-sem to return, as a percentage of it.
   *
   * SRM's end-sem papers are widely reckoned easy and generously
   * marked, so spreading a target evenly across the exam and your
   * internals asks the wrong question: you are not deciding how hard to
   * try in December, you are deciding what the internals have to carry.
   * Setting this hands the exam a fixed contribution and solves the
   * remaining internals against what's left of the threshold.
   *
   * Null solves the end-sem like any other component. It only applies
   * while the exam is ungraded — once the real mark is in, an
   * assumption about it is worthless.
   */
  assumedExternalPct?: number | null;
}

export function solveSubjectPlan(
  subject: Subject,
  marks: Mark[],
  targetGrade: Grade,
  options: SolveOptions = {}
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
    band,
    next,
  } = budgetFor(subject, marks, options.deadlines ?? [], options.today);

  // The end-sem, handed a fixed contribution instead of a share of the
  // ask. Everything below then solves the internals against what is
  // left of the threshold — which is the question actually being asked.
  const externalRow = components.find((c) => c.kind === "external" && c.obtained === null);
  // The subject's own expectation wins over the semester-wide one: some
  // papers are a formality and some are not, and one number for all of
  // them is a default, not an answer.
  const assumedPct =
    assessmentFor(subject).assumedExternalPct ?? options.assumedExternalPct;
  const assumedExternal =
    externalRow && assumedPct != null && Number.isFinite(assumedPct)
      ? clamp(assumedPct, 0, 100) / 100 * externalRow.max
      : null;
  if (externalRow && assumedExternal !== null) externalRow.assumed = assumedExternal;

  // What the solve actually works with: the assumption is banked for
  // the purpose of the ask, and its component leaves the pool.
  const solveBanked = banked + (assumedExternal ?? 0);
  const solvePool = assumedExternal !== null ? pool - externalRow!.max : pool;

  const needed = target.min - solveBanked;
  const requiredRate = solvePool > 1e-9 ? needed / solvePool : null;

  // The equal-effort spread: every component still in play is asked for
  // the same share of its own marks.
  for (const c of components) {
    if (c.obtained !== null || c.assumed !== null) continue;
    c.required = requiredRate === null ? null : Math.max(0, requiredRate) * c.max;
    c.requiredPct = c.required === null || c.max <= 0 ? null : (c.required / c.max) * 100;
  }

  const floor = banked;

  let status: PlanStatus;
  if (solvePool <= 1e-9) status = "final";
  else if (needed <= 1e-9) status = "locked";
  else if (needed > solvePool + 1e-9) status = "out-of-reach";
  else if (paceRate !== null && requiredRate !== null && paceRate >= requiredRate - 1e-9)
    status = "on-track";
  else status = "push";

  // Priced against the same scenario as the ask: with an assumption in
  // play, "achievable" means achievable given it, not given a perfect
  // end-sem you have just told the app not to expect.
  const perGrade: GradeRequirement[] = GRADE_TABLE.filter((g) => g.grade !== "F").map((g) => {
    const need = g.min - solveBanked;
    return {
      grade: g.grade,
      points: g.points,
      minTotal: g.min,
      rate: solvePool > 1e-9 ? need / solvePool : null,
      needed: need,
      secured: need <= 1e-9,
      achievable: need <= solvePool + 1e-9,
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
    assumedExternal,
    scaled,
    perGrade,
    hasAnyMarks,
    band,
    next,
  };
}
