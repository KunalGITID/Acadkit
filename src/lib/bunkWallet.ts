import type { SubjectAttendance } from "@/lib/attendance";

/**
 * Skips, counted as something you spend rather than a statistic.
 *
 * `canBunk` already existed, buried in an expanded row as a number. A
 * number invites arithmetic; a wallet invites a decision. The framing is
 * the feature — "you have three left in DSA" is the same fact as
 * "canBunk: 3" and lands completely differently.
 *
 * Nothing here is new maths. It sorts, sums, and separates the subjects
 * you can spend from the ones you're already in debt to.
 */

export interface WalletRow {
  subject: SubjectAttendance;
  /** Classes skippable while staying ≥ 75%. */
  left: number;
  /** Classes already missed. What the balance was spent on. */
  spent: number;
  /** Set when the subject is below the line: skips are no longer the question. */
  owed: number;
}

export interface Wallet {
  /** Total skips available across every subject. */
  left: number;
  /** Total classes already missed. */
  spent: number;
  /** Subjects with a balance, richest first. */
  credit: WalletRow[];
  /** Subjects below 75%, deepest debt first. */
  debt: WalletRow[];
  /** True when no subject has any attendance recorded yet. */
  empty: boolean;
}

export function buildWallet(stats: SubjectAttendance[]): Wallet {
  const rows: WalletRow[] = stats
    .filter((s) => s.total > 0)
    .map((s) => ({
      subject: s,
      left: s.canBunk,
      spent: s.total - s.attended,
      owed: s.needToAttend,
    }));

  const credit = rows.filter((r) => r.owed === 0).sort((a, b) => b.left - a.left);
  const debt = rows.filter((r) => r.owed > 0).sort((a, b) => b.owed - a.owed);

  return {
    left: credit.reduce((n, r) => n + r.left, 0),
    spent: rows.reduce((n, r) => n + r.spent, 0),
    credit,
    debt,
    empty: rows.length === 0,
  };
}

/**
 * How many pips to draw for a balance.
 *
 * A row of thirty dots is a texture, not a count — past about eight the
 * eye stops counting and starts estimating, which is the opposite of the
 * point. Beyond the cap the number carries it instead.
 */
export const PIP_CAP = 8;

export function pipsFor(left: number): { pips: number; overflow: number } {
  return { pips: Math.min(left, PIP_CAP), overflow: Math.max(0, left - PIP_CAP) };
}
