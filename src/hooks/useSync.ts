import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
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

  // Refetch on tab focus / coming back online
  useEffect(() => {
    const refetchAll = () => void qc.invalidateQueries();
    window.addEventListener("online", refetchAll);
    return () => window.removeEventListener("online", refetchAll);
  }, [qc]);
}
