import { supabase } from "@/lib/supabase";

/**
 * Sign-in is an emailed 6-digit code, not a magic link.
 *
 * In an installed iOS PWA a magic link (or an OAuth redirect) opens in
 * Safari and usually never returns to the PWA — you end up signed in on
 * the wrong surface and still signed out in the app. A code you read
 * from Mail and type into the app never leaves it.
 *
 * Sessions persist and refresh silently, so this is a one-time cost per
 * device. After the first sign-in the app opens straight to your data,
 * which is fewer taps than typing a PIN every launch.
 */

export async function sendCode(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { shouldCreateUser: true },
  });
  if (error) throw new Error(friendly(error.message));
}

export async function verifyCode(email: string, code: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: code.trim(),
    type: "email",
  });
  if (error) throw new Error(friendly(error.message));
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

/**
 * PINs the signed-in user owns, newest claim last.
 *
 * Under the 015 policies this is the authoritative list — a PIN you
 * haven't claimed returns no rows from every other table, so this is
 * what the app can actually open.
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
 * somebody else owns fails as a duplicate rather than reassigning it.
 * That makes this safe to call optimistically.
 */
export async function claimDevice(pin: string): Promise<ClaimResult> {
  const { data: session } = await supabase.auth.getUser();
  const userId = session.user?.id;
  if (!userId) throw new Error("Not signed in");

  const { error } = await supabase
    .from("device_owners")
    .insert({ device_id: pin, user_id: userId });

  if (!error) return "claimed";
  // 23505 = unique violation: the PIN is already claimed by someone.
  if (error.code === "23505") {
    const mine = await ownedDevices();
    return mine.includes(pin) ? "already-yours" : "taken";
  }
  throw new Error(error.message);
}

/** Supabase's auth errors are terse; these are the ones users actually hit. */
function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid") && m.includes("token")) return "That code isn't right — check it and try again.";
  if (m.includes("expired")) return "That code expired. Send a new one.";
  if (m.includes("rate") || m.includes("too many")) return "Too many attempts. Wait a minute, then try again.";
  if (m.includes("email")) return "That doesn't look like a valid email address.";
  return message;
}
