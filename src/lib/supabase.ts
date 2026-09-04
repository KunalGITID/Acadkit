import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anonKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — add them to .env.local"
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    // Sessions persist and refresh silently, so signing in is a one-time
    // cost per device rather than something you do daily. This is what
    // makes auth *faster* than typing a PIN every launch.
    persistSession: true,
    autoRefreshToken: true,
    storageKey: "acadkit:auth",
    // The app never receives an OAuth/magic-link redirect — sign-in is a
    // 6-digit code typed into the app — so there is no URL to detect.
    // Enabling this in a PWA also risks consuming a session from a
    // redirect Safari handled instead.
    detectSessionInUrl: false,
  },
});
