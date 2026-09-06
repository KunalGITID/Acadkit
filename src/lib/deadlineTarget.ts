import { type Grade } from "@/lib/grades";
import { ceilHalf, solveSubjectPlan } from "@/lib/plan";
import type { Deadline, Mark, Subject } from "@/types";

/**
 * What an upcoming test needs to return.
 *
 * Deadlines are used to set a target and practise toward it, so a date
 * on its own is half the answer. Given what the test is out of, the
 * budget engine knows the rest — this joins the two.
 *
 * It reads off `solveSubjectPlan`, the same solve the Insights card
 * runs, so the number on a deadline row and the number on the card
 * cannot disagree. The old version used targets.ts, which asked "what
 * fraction of my entered marks have I earned, and what does adding this
 * test do to it" — a question whose answer moved when the subject's
 * split did nothing of the kind.
 *
 * Two grades are worth showing and no more: the one you are currently on
 * pace for, and the next one up. "Hold this" and "reach this" are the
 * only two decisions available before a test; a full ladder of six is a
 * table, not an answer.
 */

export interface GradeTarget {
  grade: Grade;
  points: number;
  /** Percentage threshold this grade starts at. */
  minTotal: number;
  /** Marks needed on this test, rounded up to the next half. */
  required: number;
  /** Same as a share of the test, for a bar. */
  requiredPct: number;
  /** False when even full marks here can't get there. */
  achievable: boolean;
  /** True when the grade holds even scoring zero here. */
  secured: boolean;
}

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
  subject: Subject,
  subjectMarks: Mark[]
): DeadlineTarget | null {
  const max = Number(deadline.max_marks ?? 0);
  if (!(max > 0)) return null;

  // The target grade is irrelevant here — every field read below comes
  // off the budget, which doesn't depend on one.
  const plan = solveSubjectPlan(subject, subjectMarks, "C");
  // With nothing recorded there is no pace to hold, and every grade is
  // still open — a target would be arithmetic, not advice.
  if (!plan.hasAnyMarks || plan.pool <= 0) return null;

  // This test is part of what's left, so under the same equal-effort
  // spread the card uses it owes `rate` of its own marks.
  const targets: GradeTarget[] = plan.perGrade.map((g) => {
    const required = Math.max(0, g.rate ?? 0) * max;
    return {
      grade: g.grade,
      points: g.points,
      minTotal: g.minTotal,
      required: ceilHalf(required),
      requiredPct: Math.min(100, (required / max) * 100),
      achievable: g.achievable,
      secured: g.secured,
    };
  });

  const paceGrade = plan.paceGrade ?? plan.floorGrade;
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

  // On an F pace there is no `hold` to speak of — the grade table omits
  // F, since "what do I need to keep failing" isn't a question. The useful
  // answer is whether the next grade up is still within this test.
  if (!hold && reach) {
    return reach.achievable
      ? `${reach.required}/${max} for ${reach.grade}`
      : `${reach.grade} needs more than this test`;
  }

  // Neither holding nor improving is reachable from this test alone.
  return hold ? `${target.current} slips whatever you score` : null;
}
