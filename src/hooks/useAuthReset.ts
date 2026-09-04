import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAppStore } from "@/store/app";

/** Where PersistQueryClientProvider writes the offline cache. */
export const RQ_CACHE_KEY = "acadkit:rq-cache";

/**
 * Wipe everything the previous account left behind when a session ends.
 *
 * The read cache is persisted to localStorage under one fixed key, and
 * signing out never touched it. On a shared machine that meant the next
 * person to sign in saw the previous person's attendance and marks —
 * rendered straight from cache, before the network could correct it.
 * Their own query would eventually replace it, which is exactly what
 * makes it easy to miss.
 *
 * SIGNED_OUT also fires when a refresh token is rejected — a revoked
 * session, or a password change on another device. Without this the app
 * sat there showing an empty semester instead of returning to sign-in,
 * which reads as data loss.
 *
 * The PIN goes too: it identifies whose partition to read, so leaving it
 * behind would point the next account at the last one's data. Onboarding
 * or useAutoDevice resolves it again after the next sign-in.
 */
export function useAuthReset(): void {
  const qc = useQueryClient();
  const resetPin = useAppStore((s) => s.resetPin);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_OUT") return;
      qc.clear();
      try {
        window.localStorage.removeItem(RQ_CACHE_KEY);
      } catch {
        // Private mode, or storage disabled — the in-memory clear above
        // is what actually matters for what's on screen.
      }
      resetPin();
    });
    return () => sub.subscription.unsubscribe();
  }, [qc, resetPin]);
}
