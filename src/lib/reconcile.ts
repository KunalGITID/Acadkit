import { isAttended, isCounted } from "@/lib/attendance";
import type { AttendanceRecord, PortalSnapshot, Subject } from "@/types";

/**
 * Why a subject's percentage isn't the one the portal printed.
 *
 * The app treats a portal snapshot as the baseline and layers every
 * class recorded after `as_of` on top, so its number is deliberately
 * *not* the portal's — it's the portal's brought up to date. That is
 * the right answer and the most alarming one: a student who checks both
 * sees two figures for the same subject and concludes the app is broken,
 * which is a bad reason to stop trusting the one that's actually
 * current.
 *
 * This turns the arithmetic into something readable — here is what the
 * portal said and when, here is what you have recorded since, here is
 * the sum — so the difference reads as bookkeeping rather than a bug.
 */
export interface Reconciliation {
  /** Percentage as the portal printed it, when it published one. */
  portalPercentage: number | null;
  portalAsOf: string;
  portalAttended: number;
  portalConducted: number;
  /** Classes recorded after the snapshot date. */
  sinceAttended: number;
  sinceCounted: number;
  /** Cancelled slots recorded since — held by nobody, so in no total. */
  sinceCancelled: number;
  attended: number;
  conducted: number;
  percentage: number | null;
  /** Percentage points the layered classes moved it, against the portal's own figure. */
  delta: number | null;
  /** The rows doing the moving, newest first. */
  records: AttendanceRecord[];
}

export function reconcile(
  subject: Subject,
  records: AttendanceRecord[],
  snapshot: PortalSnapshot | undefined
): Reconciliation | null {
  // Nothing to reconcile without a portal baseline: the app's number is
  // then simply the app's, and there is no second figure to explain.
  if (!snapshot || snapshot.conducted <= 0) return null;

  const mine = records.filter((r) => r.subject_id === subject.id);
  const since = mine
    .filter((r) => r.date > snapshot.as_of)
    .sort((a, b) => b.date.localeCompare(a.date) || b.start_time.localeCompare(a.start_time));

  const counted = since.filter((r) => isCounted(r.status));
  const sinceAttended = counted.filter((r) => isAttended(r.status)).length;

  const portalAttended = snapshot.conducted - snapshot.absent;
  const attended = portalAttended + sinceAttended;
  const conducted = snapshot.conducted + counted.length;
  const percentage = conducted > 0 ? (attended / conducted) * 100 : null;

  // Against the portal's own printed figure where there is one, so the
  // comparison is to the number the student actually saw rather than to
  // one recomputed from its parts.
  const portalPct =
    snapshot.percentage ?? (snapshot.conducted > 0 ? (portalAttended / snapshot.conducted) * 100 : null);

  return {
    portalPercentage: snapshot.percentage,
    portalAsOf: snapshot.as_of,
    portalAttended,
    portalConducted: snapshot.conducted,
    sinceAttended,
    sinceCounted: counted.length,
    sinceCancelled: since.length - counted.length,
    attended,
    conducted,
    percentage,
    delta: percentage !== null && portalPct !== null ? percentage - portalPct : null,
    records: since,
  };
}
