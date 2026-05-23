import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useToast } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase";
import { useAppStore } from "@/store/useAppStore";
import type { Deadline } from "@/types/database";

export type DeadlineFilter = {
  status?: Deadline["status"];
  type?: Deadline["type"];
};

export type NewDeadlineInput = {
  subject_id?: string | null;
  title: string;
  type: Deadline["type"];
  due_date: string;
  status?: Deadline["status"];
  priority: Deadline["priority"];
};

function normalizeDeadline(row: Deadline): Deadline {
  return {
    ...row,
    subject_id: row.subject_id ?? undefined,
  };
}

export function useDeadlines(filter?: DeadlineFilter) {
  const deviceId = useAppStore((s) => s.deviceId);

  return useQuery({
    queryKey: ["deadlines", deviceId, filter?.status ?? "all", filter?.type ?? "all"],
    queryFn: async () => {
      let query = supabase
        .from("deadlines")
        .select("*")
        .eq("device_id", deviceId)
        .order("due_date", { ascending: true });

      if (filter?.status) query = query.eq("status", filter.status);
      if (filter?.type) query = query.eq("type", filter.type);

      const { data, error } = await query;
      if (error) throw error;
      return ((data ?? []) as Deadline[]).map(normalizeDeadline);
    },
    enabled: Boolean(deviceId),
  });
}

export function useAddDeadline() {
  const deviceId = useAppStore((s) => s.deviceId);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (deadline: NewDeadlineInput) => {
      const { data, error } = await supabase
        .from("deadlines")
        .insert({
          ...deadline,
          subject_id: deadline.subject_id || null,
          device_id: deviceId,
          status: deadline.status ?? "pending",
        })
        .select()
        .single();

      if (error) throw error;
      return normalizeDeadline(data as Deadline);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deadlines", deviceId] });
    },
    onError: () => {
      toast("Failed to add deadline. Check your connection.");
    },
  });
}

export function useToggleDeadline() {
  const deviceId = useAppStore((s) => s.deviceId);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (deadline: Deadline) => {
      const nextStatus: Deadline["status"] =
        deadline.status === "pending" ? "done" : "pending";

      const { data, error } = await supabase
        .from("deadlines")
        .update({ status: nextStatus })
        .eq("device_id", deviceId)
        .eq("id", deadline.id)
        .select()
        .single();

      if (error) throw error;
      return normalizeDeadline(data as Deadline);
    },
    onMutate: async (deadline) => {
      await queryClient.cancelQueries({ queryKey: ["deadlines", deviceId] });
      const previous = queryClient.getQueriesData<Deadline[]>({
        queryKey: ["deadlines", deviceId],
      });
      const nextStatus: Deadline["status"] =
        deadline.status === "pending" ? "done" : "pending";

      queryClient.setQueriesData<Deadline[]>(
        { queryKey: ["deadlines", deviceId] },
        (old = []) =>
          old.map((item) =>
            item.id === deadline.id ? { ...item, status: nextStatus } : item
          )
      );

      return { previous };
    },
    onError: (_error, _deadline, context) => {
      context?.previous.forEach(([key, data]) => {
        queryClient.setQueryData(key, data);
      });
      toast("Failed to update deadline. Try again.");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["deadlines", deviceId] });
    },
  });
}

export function useDeleteDeadline() {
  const deviceId = useAppStore((s) => s.deviceId);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("deadlines")
        .delete()
        .eq("device_id", deviceId)
        .eq("id", id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["deadlines", deviceId] });
      const previous = queryClient.getQueriesData<Deadline[]>({
        queryKey: ["deadlines", deviceId],
      });
      queryClient.setQueriesData<Deadline[]>(
        { queryKey: ["deadlines", deviceId] },
        (old = []) => old.filter((item) => item.id !== id)
      );
      return { previous };
    },
    onError: (_error, _id, context) => {
      context?.previous.forEach(([key, data]) => {
        queryClient.setQueryData(key, data);
      });
      toast("Failed to delete deadline. Try again.");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["deadlines", deviceId] });
    },
  });
}

export function useUpcomingDeadlines(limit: number) {
  const { data: deadlines = [], ...rest } = useDeadlines({ status: "pending" });

  const upcoming = useMemo(
    () =>
      deadlines
        .filter((deadline) => deadline.status === "pending")
        .sort((a, b) => a.due_date.localeCompare(b.due_date))
        .slice(0, limit),
    [deadlines, limit]
  );

  return { data: upcoming, ...rest };
}
