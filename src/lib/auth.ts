import { supabase } from "@/lib/supabase";

/**
 * Email + password, and deliberately no email delivery anywhere in the
 * flow.
 *
 * The first attempt used an emailed code. It broke on contact with
 * reality: Supabase's built-in SMTP allows a couple of sends per hour,
 * the default template ships a magic link rather than a token, and the
 * token length is a project setting the client can't know. Every one of
 * those is a way to be locked out of your own app by configuration.
 *
 * A password needs no delivery, has no rate limit, survives being an
 * installed PWA (no redirect out to Safari), and autofills from the
 * keychain — which on a phone is a Face ID tap, faster than typing a
 * PIN. Requires "Confirm email" OFF in Supabase, or sign-up tries to
 * send a confirmation and puts the email problem straight back.
 */

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

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

/**
 * PINs the signed-in user owns, oldest claim first.
 *
 * Under the 015 policies this is authoritative — a PIN you haven't
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

/**
 * Claim a PIN for the signed-in user.
 *
 * The primary key on device_id does the enforcing: claiming a PIN
 * someone else owns fails as a duplicate rather than reassigning it, so
 * this is safe to call optimistically.
 */
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
    return "That email already has an account — sign in instead.";
  if (m.includes("password") && m.includes("least"))
    return `Password needs at least ${MIN_PASSWORD} characters.`;
  if (m.includes("rate") || m.includes("too many") || m.includes("security purposes"))
    return "Too many attempts. Give it a minute.";
  // Only reachable if "Confirm email" is still on in the dashboard.
  if (m.includes("confirm")) return "Turn off “Confirm email” in Supabase → Authentication → Providers.";
  return message;
}
