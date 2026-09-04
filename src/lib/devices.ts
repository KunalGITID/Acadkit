/**
 * PIN selection, kept free of side effects so it can be tested without a
 * React tree or a Supabase client.
 *
 * The PIN is an internal partition key — there is no UI left to type or
 * change one — which is what makes a stale value dangerous rather than
 * merely untidy.
 */
/**
 * Which PIN a signed-in device should open, given what the account owns.
 *
 * Extracted from useAutoDevice so the decision can be tested without a
 * React tree — this is the logic that, when it was merely "fill an empty
 * slot", stranded a device on a stale PIN with no UI left to change it.
 *
 * Returns null to mean "leave it alone": nothing is claimed yet, so
 * onboarding should handle it.
 */
export function chooseDevice(current: string | null, owned: string[]): string | null {
  if (!owned.length) return null;
  // Already on one of ours — don't churn the store.
  if (current && owned.includes(current)) return current;
  // Oldest claim wins. Multiple claims can only exist from before the
  // PIN switcher was removed, so there is no screen left to ask on.
  return owned[0];
}
