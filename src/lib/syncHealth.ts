import { parseISODate, toISODate } from "@/lib/dates";
import type { PortalSnapshot } from "@/types";

/** Whether the portal sync is still keeping up. */

export type SyncState = "fresh" | "aging" | "stale" | "never";

export interface SyncHealth {
  state: SyncState;
  /** Days since the portal's own as-of date, or null if never synced. */
  days: number | null;
  asOf: string | null;
}

/** Beyond this the numbers on screen are probably wrong. */
const AGING_DAYS = 3;
const STALE_DAYS = 7;

export function syncHealth(
  snapshots: PortalSnapshot[],
  today: Date = new Date()
): SyncHealth {
  if (!snapshots.length) return { state: "never", days: null, asOf: null };

  // The oldest as_of across subjects: one subject lagging still means
  // the picture as a whole is that old.
  const asOf = snapshots
    .map((s) => s.as_of)
    .filter(Boolean)
    .sort()[0];
  if (!asOf) return { state: "never", days: null, asOf: null };

  const days = Math.max(
    0,
    Math.round(
      (parseISODate(toISODate(today)).getTime() - parseISODate(asOf).getTime()) / 86_400_000
    )
  );

  const state: SyncState =
    days >= STALE_DAYS ? "stale" : days >= AGING_DAYS ? "aging" : "fresh";
  return { state, days, asOf };
}
