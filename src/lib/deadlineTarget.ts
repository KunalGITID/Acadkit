import type { Grade } from "@/lib/grades";
import { labelMatchKey } from "@/lib/componentLabel";
import {
  ceilHalf,
  gradeForTargetSgpa,
  solveSubjectPlan,
  type SolveOptions,
} from "@/lib/plan";
import type { Deadline, Mark, Subject } from "@/types";

/** What an upcoming test has to return. */
export interface DeadlineNeed {
  /** Marks this test has to return, rounded up to the next half. */
  required: number;
  /** What the test is out of. */
  max: number;
  /** The grade it is being asked for. */
  grade: Grade;
  /** False when full marks here still would not keep the target alive. */
  reachable: boolean;
  /** True when nothing is needed - the grade holds regardless. */
  secured: boolean;
}

export interface DeadlineNeedOptions extends SolveOptions {
  /** Falls back to the semester target when the subject has no view. */
  targetSgpa?: number;
}

export function deadlineNeed(
  deadline: Pick<Deadline, "id" | "title" | "max_marks">,
  subject: Subject,
  subjectMarks: Mark[],
  options: DeadlineNeedOptions = {}
): DeadlineNeed | null {
  const max = Number(deadline.max_marks ?? 0);
  if (!Number.isFinite(max) || max <= 0) return null;

  const grade = subject.target_grade ?? gradeForTargetSgpa(options.targetSgpa ?? 8.5);
  const plan = solveSubjectPlan(subject, subjectMarks, grade, options);

  // The component this deadline became, or the planned one it named.
  const key = `deadline:${deadline.id}`;
  const title = labelMatchKey(deadline.title);
  const component =
    plan.components.find((c) => c.key === key) ??
    plan.components.find((c) => labelMatchKey(c.label) === title);

  // Already marked, or not in the budget at all: nothing to ask for.
  if (!component || component.obtained !== null || component.required === null) return null;

  /** A component is not always assessed in one sitting. */
  const share = Math.min(max, component.max);
  const scale = component.max > 1e-9 ? share / component.max : 1;
  const needed = component.required * scale;

  return {
    required: ceilHalf(needed),
    max: share,
    grade,
    // Reachability is a property of the component, not of one sitting:
    // a target out of reach overall is not rescued by acing this part.
    reachable: component.required <= component.max + 1e-9,
    secured: needed <= 1e-9,
  };
}

/** One line for a deadline row: the shortest true thing to say. */
export function describeNeed(need: DeadlineNeed): string {
  if (need.secured) return `${need.grade} is safe`;
  if (!need.reachable) return `${need.grade} needs more than this test`;
  return `${need.required}/${Math.round(need.max)} for ${need.grade}`;
}
