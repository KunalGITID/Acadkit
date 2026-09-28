import { useEffect } from "react";
import { clearFileCache } from "@/lib/fileCache";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAppStore } from "@/store/app";

/** Where PersistQueryClientProvider writes the offline cache. */
export const RQ_CACHE_KEY = "acadkit:rq-cache";

/** Wipe everything the previous account left behind when a session ends. */
export function useAuthReset(): void {
  const qc = useQueryClient();
  const resetPin = useAppStore((s) => s.resetPin);
  const setName = useAppStore((s) => s.setName);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_OUT") return;
      qc.clear();
      try {
        window.localStorage.removeItem(RQ_CACHE_KEY);
      } catch {
        // Private mode, or storage disabled - the in-memory clear above
        // is what actually matters for what's on screen.
      }
      // Files opened on this device are the account's too (src/lib/fileCache.ts).
      void clearFileCache();
      resetPin();
      setName("");
    });
    return () => sub.subscription.unsubscribe();
  }, [qc, resetPin, setName]);
}
