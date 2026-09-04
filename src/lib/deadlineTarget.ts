import { computeSubjectMarks, gradeForTotal, type Grade } from "@/lib/grades";
import { targetsFor, type GradeTarget } from "@/lib/targets";
import type { Deadline, Mark } from "@/types";

/**
 * What an upcoming test needs to return.
 *
 * Deadlines are used to set a target and practise toward it, so a date on
 * its own is half the answer. Given what the test is out of, targets.ts
 * already knows the rest — this joins the two.
 *
 * Two grades are worth showing and no more: the one you are currently on
 * pace for, and the next one up. "Hold this" and "reach this" are the
 * only two decisions available before a test; a full ladder of six is a
 * table, not an answer.
 */

export interface DeadlineTarget {
  /** Grade you're on pace for, and what this test needs to keep it. */
  hold: GradeTarget | null;
  /** Next grade up, and what this test needs to reach it. */
  reach: GradeTarget | null;
  /** Grade the subject is currently tracking. */
  current: Grade;
}

/** Grades best-first, so "next up" is the entry before the current one. */
const LADDER: Grade[] = ["O", "A+", "A", "B+", "B", "C", "F"];

export function deadlineTarget(
  deadline: Pick<Deadline, "max_marks">,
  subjectMarks: Mark[]
): DeadlineTarget | null {
  const max = Number(deadline.max_marks ?? 0);
  if (!(max > 0)) return null;

  const current = computeSubjectMarks(subjectMarks);
  // With nothing recorded there is no pace to hold, and every grade is
  // still open — a target would be arithmetic, not advice.
  if (!current.hasAnyMarks) return null;

  const targets = targetsFor(current, max);
  if (!targets.length) return null;

  const paceGrade = gradeForTotal(current.predictedTotal).grade;
  const i = LADDER.indexOf(paceGrade);
  const nextUp = i > 0 ? LADDER[i - 1] : null;

  return {
    current: paceGrade,
    hold: targets.find((t) => t.grade === paceGrade) ?? null,
    reach: nextUp ? (targets.find((t) => t.grade === nextUp) ?? null) : null,
  };
}

/** One line for a deadline row: the shortest true thing to say. */
export function describeTarget(target: DeadlineTarget, max: number): string | null {
  const { hold, reach } = target;

  // Already at the top, or the pace grade is banked whatever happens.
  if (hold?.secured && !reach) return `${target.current} is safe`;
  if (reach?.achievable) return `${reach.required}/${max} for ${reach.grade}`;
  if (hold && !hold.secured && hold.achievable) {
    return `${hold.required}/${max} to hold ${hold.grade}`;
  }
  if (hold?.secured) return `${target.current} is safe`;

  // On an F pace there is no `hold` to speak of — targetsFor omits F,
  // since "what do I need to keep failing" isn't a question. The useful
  // answer is whether the next grade up is still within this test.
  if (!hold && reach) {
    return reach.achievable
      ? `${reach.required}/${max} for ${reach.grade}`
      : `${reach.grade} needs more than this test`;
  }

  // Neither holding nor improving is reachable from this test alone.
  return hold ? `${target.current} slips whatever you score` : null;
}
