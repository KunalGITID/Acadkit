import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useToast } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase";
import { getSubjectsForDevice } from "@/lib/queries";
import { useAppStore } from "@/store/useAppStore";
import type { Subject } from "@/types/database";

export function useSubjects() {
  const deviceId = useAppStore((s) => s.deviceId);
  const setSubjects = useAppStore((s) => s.setSubjects);

  const query = useQuery({
    queryKey: ["subjects", deviceId],
    queryFn: () => getSubjectsForDevice(deviceId),
  });

  useEffect(() => {
    if (query.data) {
      setSubjects(query.data);
    }
  }, [query.data, setSubjects]);

  return query;
}

type NewSubject = Omit<Subject, "id" | "device_id" | "created_at">;

export function useAddSubject() {
  const deviceId = useAppStore((s) => s.deviceId);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (subject: NewSubject) => {
      const { data, error } = await supabase
        .from("subjects")
        .insert({ ...subject, device_id: deviceId })
        .select()
        .single();

      if (error) throw error;
      return data as Subject;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subjects", deviceId] });
    },
    onError: () => {
      toast("Failed to add subject. Check your connection.");
    },
  });
}

export function useDeleteSubject() {
  const deviceId = useAppStore((s) => s.deviceId);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("subjects").delete().eq("id", id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["subjects", deviceId] });
      const previous = queryClient.getQueriesData<Subject[]>({
        queryKey: ["subjects", deviceId],
      });
      queryClient.setQueriesData<Subject[]>(
        { queryKey: ["subjects", deviceId] },
        (old = []) => old.filter((item) => item.id !== id)
      );
      return { previous };
    },
    onError: (_error, _id, context) => {
      context?.previous.forEach(([key, data]) => {
        queryClient.setQueryData(key, data);
      });
      toast("Failed to delete subject. Try again.");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["subjects", deviceId] });
    },
  });
}
