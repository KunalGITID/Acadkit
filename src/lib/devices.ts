/**
 * Which account this device opens, and what to show while that is still
 * being decided. Kept free of side effects so it can be tested without a
 * React tree or a Supabase client.
 *
 * The PIN is an internal partition key — there is no UI left to type or
 * change one — which is what makes a stale value dangerous rather than
 * merely untidy.
 */
import type { ClaimResult } from "@/lib/auth";

/**
 * Claim a PIN nobody owns, for a brand-new account.
 *
 * The claim is the lock — device_owners' primary key turns a PIN someone
 * else holds into "taken" rather than a shared one — so this claims
 * first and the caller seeds afterwards. The other order cannot work
 * under owner-scoped RLS: writing a PIN's rows before owning it is
 * exactly what the policies refuse, which left every new sign-up stuck
 * on onboarding. A "does this PIN have data?" pre-check was no help
 * either, for the same reason: every PIN you don't own reads back empty.
 */
export async function claimFreshPin(
  claim: (pin: string) => Promise<ClaimResult>,
  generate: () => string,
  attempts = 10
): Promise<string> {
  for (let i = 0; i < attempts; i++) {
    const pin = generate();
    if ((await claim(pin)) !== "taken") return pin;
  }
  throw new Error("Couldn't find a free account slot — try again.");
}

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

/** What `App` puts on screen, given how far the entrance has resolved. */
export type EntryScreen =
  | "holding" // nothing decided yet — a bare themed screen
  | "sign-in"
  | "onboarding"
  | "app";

/**
 * The entrance, as one decision instead of a chain of conditions.
 *
 * The case that forced it: signing in hands back a session *before*
 * anything knows which PIN the account owns, and the PIN is what the
 * app reads its data under. For the length of that lookup a signed-in
 * user has no PIN — which used to be indistinguishable from having no
 * account, so onboarding flashed up for a split second on every
 * sign-in, offering to set up an account the person had just signed
 * into.
 *
 * "No PIN yet" and "no PIN, ever" are different states and this is
 * where they're told apart: until the lookup settles there is nothing
 * true to show, so it holds. `devicesResolved` covers a *failed*
 * lookup too — offline, onboarding is still the honest screen, and
 * holding forever would be a blank app.
 *
 * A device that already has a PIN never waits on the lookup. That path
 * is every launch after the first, and it reconciles in the background
 * (see useAutoDevice) precisely so it doesn't cost a round trip.
 */
export function entryScreen(state: {
  /** True until the stored auth session has been read back. */
  sessionLoading: boolean;
  signedIn: boolean;
  pin: string | null;
  /** True once the account's claimed PINs have been looked up. */
  devicesResolved: boolean;
}): EntryScreen {
  if (state.sessionLoading) return "holding";
  if (!state.signedIn) return "sign-in";
  if (state.pin) return "app";
  return state.devicesResolved ? "onboarding" : "holding";
}
