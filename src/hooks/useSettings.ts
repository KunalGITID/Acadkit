import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { getTodayStatus } from "@/lib/academicCalendar";
import { supabase } from "@/lib/supabase";
import { getSettingsForDevice } from "@/lib/queries";
import { useAppStore } from "@/store/useAppStore";
import type { Settings } from "@/types/database";

export function useSettings() {
  const deviceId = useAppStore((s) => s.deviceId);
  const setSettings = useAppStore((s) => s.setSettings);

  const query = useQuery({
    queryKey: ["settings", deviceId],
    queryFn: async (): Promise<Settings> => {
      let settings = await getSettingsForDevice(deviceId);

      if (!settings) {
        const { data, error } = await supabase
          .from("settings")
          .insert({
            device_id: deviceId,
            declared_holidays: [],
            current_day_order: 1,
          })
          .select()
          .single();

        if (error) throw error;
        settings = {
          ...(data as Settings),
          declared_holidays: data.declared_holidays ?? [],
          current_day_order: data.current_day_order ?? 1,
        };
      }

      return settings;
    },
  });

  useEffect(() => {
    if (query.data) {
      setSettings(query.data);
    }
  }, [query.data, setSettings]);

  return query;
}

type SettingsUpdate = Partial<Omit<Settings, "id" | "device_id">>;

export function useUpdateSettings() {
  const deviceId = useAppStore((s) => s.deviceId);
  const queryClient = useQueryClient();
  const setSettings = useAppStore((s) => s.setSettings);

  return useMutation({
    mutationFn: async (updates: SettingsUpdate) => {
      const { data, error } = await supabase
        .from("settings")
        .upsert({ ...updates, device_id: deviceId }, { onConflict: "device_id" })
        .select()
        .single();

      if (error) throw error;
      return {
        ...(data as Settings),
        declared_holidays: data.declared_holidays ?? [],
        current_day_order: data.current_day_order ?? 1,
      };
    },
    onSuccess: (data) => {
      setSettings(data);
      queryClient.invalidateQueries({ queryKey: ["settings", deviceId] });
    },
  });
}

export function useDeclareDateHoliday() {
  const updateSettings = useUpdateSettings();
  const settings = useAppStore((s) => s.settings);

  return useMutation({
    mutationFn: async (dateStr: string) => {
      const declared = settings?.declared_holidays ?? [];
      if (declared.includes(dateStr)) return settings;

      return updateSettings.mutateAsync({
        declared_holidays: [...declared, dateStr],
      });
    },
  });
}

export function useDeclareTodayHoliday() {
  const declareDate = useDeclareDateHoliday();

  return useMutation({
    mutationFn: async () => {
      const todayStr = new Date().toISOString().split("T")[0];
      return declareDate.mutateAsync(todayStr);
    },
  });
}

export function useUndoTodayHoliday() {
  const updateSettings = useUpdateSettings();
  const settings = useAppStore((s) => s.settings);

  return useMutation({
    mutationFn: async () => {
      const todayStr = new Date().toISOString().split("T")[0];
      const declared = settings?.declared_holidays ?? [];

      return updateSettings.mutateAsync({
        declared_holidays: declared.filter((d) => d !== todayStr),
      });
    },
  });
}

export function useClearDeclaredHoliday() {
  const updateSettings = useUpdateSettings();
  const settings = useAppStore((s) => s.settings);

  return useMutation({
    mutationFn: async (date: string) => {
      const declared = settings?.declared_holidays ?? [];
      return updateSettings.mutateAsync({
        declared_holidays: declared.filter((d) => d !== date),
      });
    },
  });
}

export function useTodayDayOrderFromSettings(): number | null {
  const settings = useAppStore((s) => s.settings);
  const declared = settings?.declared_holidays ?? [];
  return getTodayStatus(declared).dayOrder;
}
