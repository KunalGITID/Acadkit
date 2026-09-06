/**
 * Where an hour of work buys the most SGPA.
 *
 * `sgpaTarget.planForSgpa` answered a narrower question: which subjects
 * need to climb one grade, ordered by how far above their current rate
 * that climb sits. Two things were wrong with it as advice. It allowed
 * each subject exactly one step, so a target that needed two grades
 * from one subject came back as "at least one has to climb twice" with
 * no plan attached. And it ranked by *distance* rather than by return —
 * a subject four marks from a lift and a subject four marks from a lift
 * worth twice the credits looked equally attractive.
 *
 * This ranks by return per mark. The gain of a lift is the SGPA it
 * adds, credit-weighted; its cost is the extra marks you have to find
 * above the rate you are already managing, across everything the
 * subject has left. Marks are the honest unit — a lift needing 90% of
 * an 80-mark pool is a fortnight, one needing 90% of a 10-mark pool is
 * an evening, and a rate alone cannot tell them apart.
 *
 * Steps compound: taking a subject to A+ implies taking it to A, so
 * each move is priced against the state the previous moves left it in
 * rather than against its starting grade.
 */
import { GRADE_TABLE, type Grade } from "@/lib/grades";
import type { SubjectGradeProjection } from "@/lib/projections";
import type { Subject } from "@/types";

export interface Move {
  subject: Subject;
  from: Grade;
  to: Grade;
  /** SGPA this adds, already credit-weighted and divided out. */
  gain: number;
  /**
   * Extra marks to find above your current rate, across what the
   * subject has left. Zero when you are already scoring well enough
   * and simply have to keep it up.
   */
  cost: number;
  /** Share of every remaining mark the higher grade needs, 0–1. */
  requiredRate: number;
  /**
   * SGPA per extra mark — what the ranking is on.
   *
   * A lift above your current pace always costs something, by
   * definition, so this is finite in practice; the guard is there for
   * a threshold sitting exactly on the pace line.
   */
  efficiency: number;
}

export type AllocationStatus =
  /** Already on pace to meet it. */
  | "met"
  /** These moves get there. */
  | "reachable"
  /** Every subject at its ceiling still falls short. */
  | "out-of-reach"
  /** Nothing to project from. */
  | "unknown";

export interface Allocation {
  target: number;
  /** Credit-weighted SGPA at everyone's current pace. */
  projected: number | null;
  /** SGPA if every subject hit its ceiling. */
  ceiling: number | null;
  /** Positive when short of target. */
  gap: number | null;
  status: AllocationStatus;
  /** The moves to make, best return first. */
  moves: Move[];
  /** Projected SGPA once they land. */
  projectedAfter: number | null;
  /** Extra marks across every move — the size of the ask, in one number. */
  totalCost: number;
}

const pointsFor = (grade: Grade) => GRADE_TABLE.find((g) => g.grade === grade)?.points ?? 0;

/** Passing grades, worst to best, so a "next step up" is the next entry. */
const LADDER = [...GRADE_TABLE].filter((g) => g.grade !== "F").reverse();

/**
 * Cheapest route to a target SGPA.
 *
 * Greedy on efficiency, which is exact whenever the moves are
 * independent — and they are: no subject's marks are another's. The
 * only approximation is that it stops at the first move that clears the
 * target rather than searching for a cheaper combination that lands
 * exactly on it, which would be a worse answer to give: overshooting a
 * target by a tenth is not a cost anyone is trying to avoid.
 */
export function allocateEffort(
  projections: SubjectGradeProjection[],
  target: number
): Allocation {
  const rows = projections.filter((p) => p.subject.credits > 0);
  const credits = rows.reduce((s, p) => s + p.subject.credits, 0);

  if (credits <= 0) {
    return {
      target,
      projected: null,
      ceiling: null,
      gap: null,
      status: "unknown",
      moves: [],
      projectedAfter: null,
      totalCost: 0,
    };
  }

  const projected =
    rows.reduce((s, p) => s + p.predictedPoints * p.subject.credits, 0) / credits;
  const ceiling = rows.reduce((s, p) => s + pointsFor(p.bestGrade) * p.subject.credits, 0) / credits;
  const gap = target - projected;

  const base = {
    target,
    projected,
    ceiling,
    gap,
    moves: [] as Move[],
    projectedAfter: projected,
    totalCost: 0,
  };

  if (gap <= 1e-9) return { ...base, status: "met" };
  if (ceiling < target - 1e-9) return { ...base, status: "out-of-reach" };

  // Each subject's current rung, advanced as moves are taken.
  const at = new Map<string, Grade>(rows.map((p) => [p.subject.id, p.predictedGrade]));

  /** The next rung up for a subject, priced from where it stands now. */
  function nextMove(p: SubjectGradeProjection): Move | null {
    const current = at.get(p.subject.id)!;
    // An F is not on the ladder, and the step up from it is its first
    // rung — which is what index -1 lands on. Spelled out rather than
    // left to arithmetic.
    const i = current === "F" ? -1 : LADDER.findIndex((g) => g.grade === current);
    const up = LADDER[i + 1];
    if (!up) return null;

    const row = p.plan.perGrade.find((g) => g.grade === up.grade);
    if (!row || !row.achievable || row.rate === null) return null;

    // Extra marks over the rate you are already managing. Written as
    // the distance from your pace projection to the threshold, which is
    // what `(rate - paceRate) * pool` reduces to — the pool cancels.
    // Worth stating plainly: how many more marks a grade costs does not
    // depend on how many chances are left, only on how far away it is.
    // What the pool decides is whether it is reachable at all, and at
    // what rate — which is `requiredRate`, carried alongside.
    const cost = Math.max(0, row.minTotal - p.predictedTotal);
    const gain = ((up.points - pointsFor(current)) * p.subject.credits) / credits;
    if (gain <= 0) return null;

    return {
      subject: p.subject,
      from: current,
      to: up.grade,
      gain,
      cost,
      requiredRate: row.rate,
      efficiency: cost <= 1e-9 ? Number.POSITIVE_INFINITY : gain / cost,
    };
  }

  const moves: Move[] = [];
  let running = projected;
  let totalCost = 0;

  // At most one move per subject per rung, so this cannot spin.
  for (let guard = 0; guard < rows.length * LADDER.length && running < target - 1e-9; guard++) {
    let best: Move | null = null;
    for (const p of rows) {
      const move = nextMove(p);
      if (!move) continue;
      if (
        !best ||
        move.efficiency > best.efficiency ||
        // Same return per mark: prefer the one with more headroom. Two
        // lifts costing six marks are not equally likely if one wants
        // 70% of what's left and the other wants 96%.
        (move.efficiency === best.efficiency && move.requiredRate < best.requiredRate)
      ) {
        best = move;
      }
    }
    if (!best) break;
    moves.push(best);
    at.set(best.subject.id, best.to);
    running += best.gain;
    totalCost += best.cost;
  }

  // The ceiling said the target was reachable, so exhausting the moves
  // without getting there would mean these two disagree. They are
  // derived from the same per-grade rows, so it should not happen —
  // but reporting "reachable" over a plan that falls short would be
  // the one failure worth being loud about.
  const status: AllocationStatus = running >= target - 1e-9 ? "reachable" : "out-of-reach";

  return { ...base, status, moves, projectedAfter: running, totalCost };
}
