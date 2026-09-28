import { supabase } from "@/lib/supabase";
import { unsubscribeFromPush } from "@/lib/push";

/** Email + password, and deliberately no email delivery anywhere in the flow. */

/** Supabase's own floor is 6; this is a nudge, not a policy. */
export const MIN_PASSWORD = 8;

export async function signUp(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) throw new Error(friendly(error.message));
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) throw new Error(friendly(error.message));
}

/** Sign out, taking this device off the account's reminders first. */
export async function signOut(): Promise<void> {
  try {
    const endpoint = await unsubscribeFromPush();
    if (endpoint) await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  } catch {
    // Unsubscribing is best effort; the session still has to end.
  }
  await supabase.auth.signOut();
}

/**
 * PINs the signed-in user owns, oldest claim first.
 *
 * Under the 015 policies this is authoritative - a PIN you haven't
 * claimed reads back empty from every other table.
 */
export async function ownedDevices(): Promise<string[]> {
  const { data, error } = await supabase
    .from("device_owners")
    .select("device_id")
    .order("claimed_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row.device_id as string);
}

export type ClaimResult = "claimed" | "already-yours" | "taken";

/** Claim a PIN for the signed-in user. */
export async function claimDevice(pin: string): Promise<ClaimResult> {
  const { data: session } = await supabase.auth.getUser();
  const userId = session.user?.id;
  if (!userId) throw new Error("Not signed in");

  const { error } = await supabase
    .from("device_owners")
    .insert({ device_id: pin, user_id: userId });

  if (!error) return "claimed";
  if (error.code === "23505") {
    const mine = await ownedDevices();
    return mine.includes(pin) ? "already-yours" : "taken";
  }
  throw new Error(error.message);
}

/** Supabase's auth errors are terse; these are the ones users actually hit. */
function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login")) return "Wrong email or password.";
  if (m.includes("already registered") || m.includes("already been registered"))
    return "That email already has an account - sign in instead.";
  if (m.includes("password") && m.includes("least"))
    return `Password needs at least ${MIN_PASSWORD} characters.`;
  if (m.includes("rate") || m.includes("too many") || m.includes("security purposes"))
    return "Too many attempts. Give it a minute.";
  // Only reachable if "Confirm email" is still on in the dashboard.
  if (m.includes("confirm")) return "Turn off “Confirm email” in Supabase → Authentication → Providers.";
  return message;
}
