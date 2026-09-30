import type { Session } from "@supabase/supabase-js";

/** The Supabase client's storageKey (src/lib/supabase.ts). */
export const AUTH_KEY = "acadkit:auth";

/**
 * The session this device last saved, read synchronously and without
 * loading the Supabase client - main.tsx uses it to decide whether to load
 * the whole app or just the landing page.
 */
export function savedSession(): Session | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    const s = raw ? (JSON.parse(raw) as Session) : null;
    return s?.access_token && s.refresh_token && s.user ? s : null;
  } catch {
    return null;
  }
}
