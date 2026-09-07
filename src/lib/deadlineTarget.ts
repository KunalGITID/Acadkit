import type { Grade } from "@/lib/grades";
import {
  ceilHalf,
  gradeForTargetSgpa,
  normLabel,
  solveSubjectPlan,
  type SolveOptions,
} from "@/lib/plan";
import type { Deadline, Mark, Subject } from "@/types";

/**
 * What an upcoming test has to return.
 *
 * A date on its own is half the answer: deadlines are used to set a
 * target and practise toward it. This says what the target costs.
 *
 * It does not compute anything. A test you have logged with a mark
 * value is already a component of the subject's budget — the Insights
 * card lists it and solves it along with everything else — so this
 * finds that component and reads its number off. Same solve, same
 * assumptions, same answer; a deadline row and the card cannot drift
 * apart because there is only one calculation.
 *
 * It answers for the grade you are actually chasing in that subject,
 * the one set on its Insights card, rather than for whatever grade your
 * current pace happens to imply. Those are different questions, and the
 * one worth putting next to a date is the one you chose.
 */
export interface DeadlineNeed {
  /** Marks this test has to return, rounded up to the next half. */
  required: number;
  /** What the test is out of. */
  max: number;
  /** The grade it is being asked for. */
  grade: Grade;
  /** False when full marks here still would not keep the target alive. */
  reachable: boolean;
  /** True when nothing is needed — the grade holds regardless. */
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
  const title = normLabel(deadline.title);
  const component =
    plan.components.find((c) => c.key === key) ??
    plan.components.find((c) => normLabel(c.label) === title);

  // Already marked, or not in the budget at all: nothing to ask for.
  if (!component || component.obtained !== null || component.required === null) return null;

  /**
   * A component is not always assessed in one sitting.
   *
   * FJ-1 can be worth 15 while the test on the 10th is 10 of them, the
   * rest arriving later. Quoting the component's 11.5/15 next to that
   * date answers a question nobody asked: what the whole component
   * owes, on the day you sit part of it. The share this sitting owes is
   * the same equal-effort rate applied to its own marks.
   *
   * A deadline claiming more marks than the component has is bad data,
   * not an instalment, so it is capped rather than believed.
   */
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
