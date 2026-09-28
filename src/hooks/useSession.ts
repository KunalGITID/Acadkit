import { useEffect, useState } from "react";
import { isAuthRetryableFetchError, type Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { flushPendingReports } from "@/lib/crashLog";

export interface SessionState {
  session: Session | null;
  /** True until the stored session has been read back from storage. */
  loading: boolean;
}

const AUTH_KEY = "acadkit:auth"; // storageKey in src/lib/supabase.ts

/** The session this device last saved, read synchronously. */
function savedSession(): Session | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    const s = raw ? (JSON.parse(raw) as Session) : null;
    return s?.access_token && s.refresh_token && s.user ? s : null;
  } catch {
    return null;
  }
}

/** The current auth session, kept live. */
export function useSession(): SessionState {
  const [session, setSession] = useState<Session | null>(savedSession);
  const [loading, setLoading] = useState(() => savedSession() === null);

  useEffect(() => {
    let alive = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (!alive) return;
      // A refresh that failed for want of a network says nothing about the account: keep the saved session and the cached app.
      if (data.session || !isAuthRetryableFetchError(error)) setSession(data.session);
      setLoading(false);
      // Crashes captured while signed out couldn't be written - the
      // error_log policy is `to authenticated`. Now there's a session.
      if (data.session) void flushPendingReports();
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
      if (next) void flushPendingReports();
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { session, loading };
}
