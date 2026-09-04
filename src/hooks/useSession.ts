import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export interface SessionState {
  session: Session | null;
  /** True until the stored session has been read back from storage. */
  loading: boolean;
}

/**
 * The current auth session, kept live.
 *
 * `loading` matters: on a cold start Supabase reads the persisted
 * session asynchronously, and rendering the sign-in screen during that
 * gap would flash a login prompt at someone who is already signed in —
 * every single launch.
 */
export function useSession(): SessionState {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { session, loading };
}
