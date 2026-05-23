import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useToast } from "@/components/ui/toast";
import { normalizeTime } from "@/lib/constants";
import { supabase } from "@/lib/supabase";
import { getTimetableForDevice } from "@/lib/queries";
import { useAppStore } from "@/store/useAppStore";
import type { TimetableSlot, TimetableSlotWithSubject } from "@/types/database";

export function useTimetable() {
  const deviceId = useAppStore((s) => s.deviceId);

  return useQuery({
    queryKey: ["timetable", deviceId],
    queryFn: () => getTimetableForDevice(deviceId),
  });
}

export function useTimetableByDay(dayOrder: number) {
  const { data: slots = [], ...rest } = useTimetable();

  const daySlots = useMemo(
    () =>
      slots
        .filter((slot) => slot.day_order === dayOrder)
        .sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [slots, dayOrder]
  );

  return { data: daySlots, ...rest };
}

export function useTodaySlots(): TimetableSlotWithSubject[] {
  const todayDayOrder = useAppStore((s) => s.todayDayOrder);
  const subjects = useAppStore((s) => s.subjects);
  const { data: slots = [] } = useTimetable();

  return useMemo(() => {
    if (todayDayOrder === null) return [];

    return slots
      .filter((slot) => slot.day_order === todayDayOrder)
      .sort((a, b) => a.start_time.localeCompare(b.start_time))
      .map((slot) => {
        const subject = subjects.find((s) => s.id === slot.subject_id);
        if (!subject) return null;
        return { ...slot, subject };
      })
      .filter((slot): slot is TimetableSlotWithSubject => slot !== null);
  }, [slots, subjects, todayDayOrder]);
}

type NewTimetableSlot = Omit<TimetableSlot, "id" | "created_at">;

export function useAddSlot() {
  const deviceId = useAppStore((s) => s.deviceId);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (slot: NewTimetableSlot) => {
      const { data, error } = await supabase
        .from("timetable_slots")
        .insert({
          ...slot,
          device_id: deviceId,
          start_time: normalizeTime(slot.start_time),
          end_time: normalizeTime(slot.end_time),
        })
        .select()
        .single();

      if (error) throw error;
      return {
        ...data,
        start_time: normalizeTime(data.start_time),
        end_time: normalizeTime(data.end_time),
      } as TimetableSlot;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["timetable", deviceId] });
    },
    onError: () => {
      toast("Failed to add slot. Check your connection.");
    },
  });
}

type UpdateSlot = Partial<Omit<TimetableSlot, "id" | "device_id" | "created_at">> & { id: string };

export function useUpdateSlot() {
  const deviceId = useAppStore((s) => s.deviceId);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updates }: UpdateSlot) => {
      const { data, error } = await supabase
        .from("timetable_slots")
        .update(updates)
        .eq("id", id)
        .eq("device_id", deviceId)
        .select()
        .single();
      if (error) throw error;
      return data as TimetableSlot;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["timetable", deviceId] });
    },
    onError: () => {
      toast("Failed to update slot. Try again.");
    },
  });
}

export function useDeleteSlot() {
  const deviceId = useAppStore((s) => s.deviceId);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("timetable_slots")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["timetable", deviceId] });
      const previous = queryClient.getQueriesData<TimetableSlot[]>({
        queryKey: ["timetable", deviceId],
      });
      queryClient.setQueriesData<TimetableSlot[]>(
        { queryKey: ["timetable", deviceId] },
        (old = []) => old.filter((item) => item.id !== id)
      );
      return { previous };
    },
    onError: (_error, _id, context) => {
      context?.previous.forEach(([key, data]) => {
        queryClient.setQueryData(key, data);
      });
      toast("Failed to delete slot. Try again.");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["timetable", deviceId] });
    },
  });
}
