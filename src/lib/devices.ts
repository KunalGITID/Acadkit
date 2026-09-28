/** Which account this device opens, and what to show while that is still being decided. */
import type { ClaimResult } from "@/lib/auth";

/** Claim a PIN nobody owns, for a brand-new account. */
export async function claimFreshPin(
  claim: (pin: string) => Promise<ClaimResult>,
  generate: () => string,
  attempts = 10
): Promise<string> {
  for (let i = 0; i < attempts; i++) {
    const pin = generate();
    if ((await claim(pin)) !== "taken") return pin;
  }
  throw new Error("Couldn't find a free account slot - try again.");
}

/** Which PIN a signed-in device should open, given what the account owns. */
export function chooseDevice(current: string | null, owned: string[]): string | null {
  if (!owned.length) return null;
  // Already on one of ours - don't churn the store.
  if (current && owned.includes(current)) return current;
  // Oldest claim wins. Multiple claims can only exist from before the
  // PIN switcher was removed, so there is no screen left to ask on.
  return owned[0];
}

/** What `App` puts on screen, given how far the entrance has resolved. */
export type EntryScreen =
  | "holding" // nothing decided yet - a bare themed screen
  | "sign-in"
  | "onboarding"
  | "app";

/** The entrance, as one decision instead of a chain of conditions. */
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
