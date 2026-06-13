import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { onBroadcastInvalidate } from "@/lib/broadcast";
import { usePin } from "@/hooks/useData";

const TABLE_TO_KEY: Record<string, string> = {
  settings: "settings",
  subjects: "subjects",
  timetable_slots: "timetable",
  attendance: "attendance",
  marks: "marks",
  deadlines: "deadlines",
};

/**
 * Keeps this client fresh from two directions:
 *  - BroadcastChannel: other tabs of the same origin
 *  - Supabase realtime: other devices using the same PIN
 */
export function useSync() {
  const pin = usePin();
  const qc = useQueryClient();

  useEffect(() => {
    return onBroadcastInvalidate((keys) => {
      for (const key of keys) void qc.invalidateQueries({ queryKey: [key, pin] });
    });
  }, [qc, pin]);

  useEffect(() => {
    const channel = supabase.channel(`acadkit-${pin}`);
    for (const [table, key] of Object.entries(TABLE_TO_KEY)) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `device_id=eq.${pin}` },
        () => void qc.invalidateQueries({ queryKey: [key, pin] })
      );
    }
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc, pin]);

  // On reconnect: flush edits made while offline, then refetch.
  useEffect(() => {
    const onOnline = () => {
      const paused = qc.getMutationCache().getAll().filter((m) => m.state.isPaused).length;
      void qc.resumePausedMutations().then(() => qc.invalidateQueries());
      if (paused > 0)
        toast.success(`Back online — syncing ${paused} offline change${paused > 1 ? "s" : ""}`);
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [qc]);
}
