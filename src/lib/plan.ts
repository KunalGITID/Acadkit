/** The assessment-budget engine. */
import { labelMatchKey } from "@/lib/componentLabel";
import { todayISO } from "@/lib/dates";
import { countsInSgpa, GRADE_TABLE, gradeForTotal } from "@/lib/grades";
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

/** Rounding has a direction, and it is not the same in both places. */
export function floorHalf(n: number): number {
  const v = Math.floor(n * 2 + 1e-9) / 2;
  return v === 0 ? 0 : v;
}

/**
 * Marks you hold, as shown: floored to 2 decimals. SRM keeps the decimals
 * (CT-1 7.6 + an assignment 2 is 9.6, not 10), and a grade cut-off counts
 * them (90.6 is A+, not O), so showing fewer decimals - or rounding up -
 * can show a total on the wrong side of a grade. The epsilon absorbs float
 * error (9.6 * 100 is 959.999...).
 */
export function floorMarks(n: number): number {
  const v = Math.floor(n * 100 + 1e-6) / 100;
  return v === 0 ? 0 : v;
}

/** A /100 total, floored (to 2 decimals) so it can never contradict its own grade. */
export function floorTotal(n: number): number {
  return floorMarks(n);
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

/** A mark as a share of what it's worth in the budget. */
function share(obtained: number, max: number, weight: number): number {
  if (!Number.isFinite(obtained) || !Number.isFinite(max) || max <= 0) return 0;
  return clamp(obtained / max, 0, 1) * weight;
}

/** A subject's assessment, with every older shape filled in. */
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
    expected: raw?.expected ?? null,
    components: (raw?.components ?? []).filter(
      (c) => c && Number.isFinite(c.max) && c.max > 0
    ),
  };
}

/** A component's type, read off its label. */
export function inferType(label: string): MarkComponentType {
  const l = label.trim().toLowerCase();
  // SRM's own names first: FT/FJ are the formative tests, LLT/LLJ the
  // life-long-learning ones. Without these, a plan typed in the
  // institution's vocabulary came out labelled CT.
  if (/^ll[tj]\b|^ll[tj]-/.test(l)) return "Lab";
  if (/^f[tj]\b|^f[tj]-/.test(l)) return "CT";
  if (l.includes("lab") || l.includes("prac")) return "Lab";
  if (l.includes("assign") || l.includes("hw") || l.includes("home")) return "Assignment";
  if (l.includes("project") || l.includes("mini")) return "Project";
  return "CT";
}

/** A subject's assessment as the editor should show it, old shapes filled in. */
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

/** Add a component the moment it's announced, from the Marks page. */
export function announceComponent(
  subject: Subject,
  component: { label: string; type: MarkComponentType; max: number },
  marks: Mark[] = []
): { assessment: Assessment } | { error: string } {
  const base = editableAssessment(subject.assessment, !!subject.internal_only);
  const label = component.label.trim();
  if (!label) return { error: "Give the component a label" };
  if (!Number.isFinite(component.max) || component.max <= 0)
    return { error: "Enter what it's out of" };

  const key = labelMatchKey(label);
  if (base.components.some((c) => labelMatchKey(c.label) === key))
    return { error: `${label} is already announced` };

  if (!base.complete) {
    // Graded marks the plan doesn't name still take their weight - the
    // budget counts them as "extra" components - so they have to be in
    // the sum, or the announcement fits here and then rescales the plan.
    const declared = new Set(base.components.map((c) => labelMatchKey(c.label)));
    const extras = marks.filter(
      (m) => !m.is_external && Number(m.max_marks) > 0 && !declared.has(labelMatchKey(m.label))
    );
    const claimed =
      base.components.reduce((s, c) => s + (Number(c.max) || 0), 0) +
      extras.reduce((s, m) => s + Number(m.max_marks), 0);
    const free = base.internal - claimed;
    if (component.max > free + 1e-9) {
      const taken = extras.length
        ? ` (${extras.map((m) => `${m.label} /${m.max_marks}`).join(", ")} count toward it - fix the plan in Settings if one is out of the wrong total)`
        : "";
      return {
        error:
          free <= 1e-9
            ? `All ${base.internal} internal marks are accounted for${taken}`
            : `Only ${Math.round(free * 10) / 10} of the ${base.internal} internal marks are left${taken}`,
      };
    }
  }

  const n = base.components.length;
  return {
    assessment: {
      ...base,
      components: [
        ...base.components,
        { key: `a${Date.now().toString(36)}${n}`, label, type: component.type, max: component.max },
      ],
    },
  };
}

/**
 * Declared components with no mark yet - what the Marks card shows as
 * announced, so an announcement doesn't vanish into the plan unseen.
 */
export function announcedPending(subject: Subject, marks: Mark[]): PlannedComponent[] {
  const graded = new Set(marks.filter((m) => !m.is_external).map((m) => labelMatchKey(m.label)));
  return assessmentFor(subject).components.filter((c) => !graded.has(labelMatchKey(c.label)));
}

export type ComponentKind =
  /** Declared in the plan, or graded and matched to a declared row. */
  | "planned"
  /** Graded but not in the plan - it happened, so it counts regardless. */
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
   * Dated, still ungraded, and the date has passed - the test happened
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
  /** /100 secured so far - the floor. */
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

/** Solve one subject against a target grade. */
/** A subject's budget, before any target is applied. */
export interface SubjectBudget {
  internalWeight: number;
  externalWeight: number;
  components: SolvedComponent[];
  /** /100 secured so far - the floor. */
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
  /** The soonest dated component still to come. */
  next: SolvedComponent | null;
}

/** Titles that mean the end-sem rather than an internal component. */
const EXTERNAL_ALIASES = new Set([
  "endsem",
  "endsems",
  "endsemester",
  "endsemexam",
  "endsemesterexam",
  "endsemesterexamination",
  "finalexam",
  "final",
  "semexam",
  "semesterexam",
  "external",
  "theoryexam",
  // How the scan and faculty write it: "T-EXT", "Theory Ext".
  "text",
  "ext",
  "theoryext",
  "theoryexternal",
]);

/** Whether a label names the end-sem ("T-EXT", "End Sem", "Final exam"). */
export function isExternalLabel(label: string): boolean {
  return EXTERNAL_ALIASES.has(labelMatchKey(label));
}

/**
 * Whether a date can belong to this component, given the ones around it:
 * a series of the same type is sat in plan order, so FT-4 can't come before
 * FT-3. Without this, an old unnamed "Exam" deadline of the right weight (an
 * earlier test, already marked) got pinned on a test still months away, and
 * the card asked how it went.
 */
function fitsInOrder(
  raw: Array<{ key: string; type: MarkComponentType; date: string | null; kind: ComponentKind }>,
  c: { key: string; type: MarkComponentType },
  date: string
): boolean {
  const series = raw.filter((r) => r.type === c.type && r.kind !== "deadline");
  const at = series.findIndex((r) => r.key === c.key);
  if (at < 0) return true;
  const before = series.slice(0, at).some((r) => r.date !== null && r.date >= date);
  const after = series.slice(at + 1).some((r) => r.date !== null && r.date <= date);
  return !before && !after;
}

/** Match deadlines onto components, then adopt what is left over - but only into weight that is actually free. */
function claimDeadlines(
  raw: Array<{ label: string; max: number; obtained: number | null; date: string | null; key: string; type: MarkComponentType; kind: ComponentKind }>,
  deadlines: Deadline[],
  internalMarks: Mark[],
  internalWeight: number
): void {
  // Soonest first.
  const dated = deadlines
    .filter((d) => d.due_date)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  if (dated.length === 0) return;
  const weighed = dated.filter(
    (d) => Number.isFinite(Number(d.max_marks)) && Number(d.max_marks) > 0
  );

  const taken = new Set<string>();
  const pending = () => raw.filter((c) => c.obtained === null);

  // 1. By name - the only pairing you control directly.
  for (const c of pending()) {
    const hit = dated.find((d) => !taken.has(d.id) && labelMatchKey(d.title) === labelMatchKey(c.label));
    if (hit) {
      taken.add(hit.id);
      c.date = hit.due_date.slice(0, 10);
    }
  }

  // 2. Adopt into free weight; failing that, date by an unambiguous
  //    weight match rather than distorting the plan to fit.
  const graded = new Set(internalMarks.map((m) => labelMatchKey(m.label)));
  let claimed = raw.reduce((sum, c) => sum + c.max, 0);

  for (const d of weighed) {
    if (taken.has(d.id)) continue;
    const key = labelMatchKey(d.title);
    if (graded.has(key) || EXTERNAL_ALIASES.has(key)) continue;
    if (raw.some((c) => labelMatchKey(c.label) === key)) continue;

    const max = Number(d.max_marks);
    if (claimed + max <= internalWeight + 1e-9) {
      taken.add(d.id);
      claimed += max;
      raw.push({
        key: `deadline:${d.id}`,
        label: d.title,
        type: inferType(d.title),
        kind: "deadline",
        max,
        obtained: null,
        date: d.due_date.slice(0, 10),
      });
      continue;
    }

    // No room.
    const due = d.due_date.slice(0, 10);
    const rivals = pending().filter((c) => c.date === null && c.max === max && fitsInOrder(raw, c, due));
    const others = weighed.filter((o) => !taken.has(o.id) && Number(o.max_marks) === max);
    if (rivals.length === 1 && others.length === 1) {
      taken.add(d.id);
      rivals[0].date = due;
    }
  }
}

function budgetFor(
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
    const k = labelMatchKey(m.label);
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
    const hit = byLabel.get(labelMatchKey(c.label));
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

  // Deadlines, in one pass: date the components they clearly refer to, then adopt whatever is left over as components of its own.
  claimDeadlines(raw, deadlines, internalMarks, internalWeight);

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
    // Declared complete but short - same scaling, opposite direction.
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
  // here - from a deadline named like one.
  const external = components.find((c) => c.kind === "external");
  if (external) {
    const hit = deadlines.find(
      (d) =>
        d.due_date &&
        (EXTERNAL_ALIASES.has(labelMatchKey(d.title)) ||
          labelMatchKey(d.title) === labelMatchKey(external.label))
    );
    if (hit) {
      external.date = hit.due_date.slice(0, 10);
      external.overdue = external.date < today;
    }
  }

  // Keys become React keys downstream, and a plan can carry duplicates
  // - jsonb edited by hand, or a row copied in the editor. Deduping
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
  // "Next" means next, so a date that has already passed is not a candidate however soon it once was.
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
    next: upcoming[0] ?? null,
  };
}

/** A subject's outlook with no target involved: where your current rate lands you, and the bracket around it. */
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

/** Predicted SGPA = Σ(points × credits) / Σcredits over credit-bearing subjects with at least one mark. 0-credit (audit) subjects never count. */
export function computeSgpa(
  subjects: Subject[],
  marksBySubject: Map<string, Mark[]>
): SgpaResult {
  const rows = subjects.map((subject) => ({
    subject,
    marks: subjectOutlook(subject, marksBySubject.get(subject.id) ?? []),
  }));
  const counted = rows.filter((r) => countsInSgpa(r.subject) && r.marks.hasAnyMarks);
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
  /** What you expect the end-sem to return, as a percentage of it. */
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
    next,
  } = budgetFor(subject, marks, options.deadlines ?? [], options.today);

  // The end-sem, handed a fixed contribution instead of a share of the
  // ask. Everything below then solves the internals against what is
  // left of the threshold - which is the question actually being asked.
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
    next,
  };
}
