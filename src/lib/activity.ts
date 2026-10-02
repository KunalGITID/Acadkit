import { supabase } from "@/lib/supabase";
import { RELEASE } from "@/lib/release";
import { toISODate } from "@/lib/dates";

/** Which PIN and day this device last recorded, so it writes once a day, not on every launch. */
const KEY = "acadkit:active-day";

/** Opened from the home screen rather than a browser tab. */
export function isInstalled(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Note that this account used the app today (migration 039). Best effort:
 * offline or refused, it simply tries again on the next launch, and it
 * never throws - counting users must never cost one a crash.
 */
export async function recordActiveDay(pin: string, today: Date = new Date()): Promise<void> {
  const day = toISODate(today);
  const stamp = `${pin}:${day}`;
  try {
    if (localStorage.getItem(KEY) === stamp) return;
  } catch {
    /* storage disabled: record anyway, the primary key dedupes */
  }
  try {
    // A plain insert, not an upsert: ON CONFLICT has to read the existing
    // row, and active_days is write-only (no read policy), so an upsert was
    // refused for every user and no day was ever recorded. A second launch
    // the same day now fails as a duplicate (23505) - which means recorded.
    const { error } = await supabase
      .from("active_days")
      .insert({ device_id: pin, day, installed: isInstalled(), release: RELEASE });
    if (error && error.code !== "23505") return;
    try {
      localStorage.setItem(KEY, stamp);
    } catch {
      /* nothing to do */
    }
  } catch {
    /* offline: next launch */
  }
}
