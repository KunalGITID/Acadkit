import type { Grade } from "@/lib/grades";
import type { SubjectGradeProjection } from "@/lib/projections";
import type { Subject } from "@/types";

/**
 * What it would take to finish the semester at a target SGPA.
 *
 * `cgpa.ts` says which SGPA this semester needs; this says which
 * subjects have to move to produce it. Without that second step the
 * target is a number you can't act on: "you need 8.5" is not advice,
 * "you need the OS end-sem to come back four marks above your current
 * pace" is.
 *
 * Everything here is read off `projectSubjectGrade`, which already
 * knows each subject's predicted grade, its ceiling, and the end-sem
 * mark each grade needs. Nothing is re-derived, so this can't disagree
 * with the per-subject cards it sits above.
 */

export interface Lift {
  subject: Subject;
  from: Grade;
  to: Grade;
  /** SGPA points this adds, already credit-weighted and divided out. */
  gain: number;
  /** End-sem mark /40 the higher grade needs, when the subject has one. */
  externalNeeded: number | null;
  /**
   * How far above the current pace that mark is — the real cost of the
   * lift. A subject needing 32 when it is already tracking 30 is a
   * cheaper ask than one needing 28 while tracking 18, even though 28
   * is the smaller number.
   */
  extraNeeded: number | null;
}

export type PlanStatus =
  /** Already on pace to meet it. */
  | "met"
  /** These lifts get there. */
  | "reachable"
  /** Even every subject at its ceiling falls short. */
  | "out-of-reach"
  /** Some subjects must climb more than one grade. */
  | "needs-more-than-one-grade"
  /** No marks yet — nothing to project from. */
  | "unknown";

export interface SgpaPlan {
  target: number;
  projected: number | null;
  /** SGPA if every subject achieved its best possible grade. */
  ceiling: number | null;
  /** Positive when short of target. */
  gap: number | null;
  status: PlanStatus;
  /** Cheapest single-grade lifts that close the gap, easiest first. */
  lifts: Lift[];
  /** Projected SGPA once `lifts` land. */
  projectedAfter: number | null;
}

/** Credit-bearing subjects with something to project from. */
function counted(projections: SubjectGradeProjection[]): SubjectGradeProjection[] {
  return projections.filter((p) => p.subject.credits > 0);
}

export function planForSgpa(
  projections: SubjectGradeProjection[],
  target: number
): SgpaPlan {
  const rows = counted(projections);
  const credits = rows.reduce((sum, p) => sum + p.subject.credits, 0);

  if (credits <= 0) {
    return {
      target,
      projected: null,
      ceiling: null,
      gap: null,
      status: "unknown",
      lifts: [],
      projectedAfter: null,
    };
  }

  const sgpaOf = (points: (p: SubjectGradeProjection) => number) =>
    rows.reduce((sum, p) => sum + points(p) * p.subject.credits, 0) / credits;

  const projected = sgpaOf((p) => p.predictedPoints);
  const ceiling = sgpaOf((p) => gradePoints(p, p.bestGrade));
  const gap = target - projected;

  const base = {
    target,
    projected,
    ceiling,
    gap,
    lifts: [] as Lift[],
    projectedAfter: projected,
  };

  if (gap <= 0) return { ...base, status: "met" };
  if (ceiling < target) return { ...base, status: "out-of-reach" };

  // One step up per subject: the actionable increment. Ordered by how
  // far above current pace the required mark is, so the first suggestion
  // is the one already nearly true.
  const available: Lift[] = rows
    .filter((p) => p.nextGrade !== null)
    .map((p) => {
      const next = p.nextGrade!;
      const externalNeeded = next.externalNeeded;
      return {
        subject: p.subject,
        from: p.predictedGrade,
        to: next.grade,
        gain: ((next.points - p.predictedPoints) * p.subject.credits) / credits,
        externalNeeded,
        extraNeeded:
          externalNeeded !== null && p.paceExternal !== null
            ? externalNeeded - p.paceExternal
            : null,
      };
    })
    .filter((l) => l.gain > 0)
    .sort((a, b) => {
      const ea = a.extraNeeded ?? Number.POSITIVE_INFINITY;
      const eb = b.extraNeeded ?? Number.POSITIVE_INFINITY;
      if (ea !== eb) return ea - eb;
      return b.gain - a.gain;
    });

  const lifts: Lift[] = [];
  let running = projected;
  for (const lift of available) {
    if (running >= target) break;
    lifts.push(lift);
    running += lift.gain;
  }

  // The ceiling says the target is reachable, but not with one grade
  // each — some subject has to climb two. Saying "reachable" and
  // listing a plan that doesn't get there would be worse than saying so.
  if (running < target) {
    return { ...base, status: "needs-more-than-one-grade", lifts, projectedAfter: running };
  }

  return { ...base, status: "reachable", lifts, projectedAfter: running };
}

/** Points for a grade, read off the projection's own target table. */
function gradePoints(p: SubjectGradeProjection, grade: Grade): number {
  const row = p.targets.find((t) => t.grade === grade);
  if (row) return row.points;
  // Internal-only subjects carry no target table; their best is their
  // prediction, since there is no end-sem left to change it.
  return p.predictedPoints;
}
