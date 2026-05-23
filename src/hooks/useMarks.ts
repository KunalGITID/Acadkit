import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  computeGradeResult,
  computeSGPA,
  scaleInternalTo60,
  type SubjectSGPAResult,
} from "@/lib/sgpa";
import { supabase } from "@/lib/supabase";
import { useAppStore } from "@/store/useAppStore";
import type { Mark } from "@/types/database";

export type NewMarkInput = Omit<Mark, "id" | "device_id" | "added_at">;

function normalizeMark(row: Mark): Mark {
  return {
    ...row,
    marks_obtained: Number(row.marks_obtained),
    max_marks: Number(row.max_marks),
    is_external: Boolean(row.is_external),
  };
}

export function useMarks(subjectId?: string) {
  const deviceId = useAppStore((s) => s.deviceId);

  return useQuery({
    queryKey: ["marks", deviceId, subjectId ?? "all"],
    queryFn: async () => {
      let query = supabase
        .from("marks")
        .select("*")
        .eq("device_id", deviceId)
        .order("added_at", { ascending: true });

      if (subjectId) {
        query = query.eq("subject_id", subjectId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return ((data ?? []) as Mark[]).map(normalizeMark);
    },
    enabled: Boolean(deviceId),
  });
}

export function useAddMark() {
  const deviceId = useAppStore((s) => s.deviceId);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (mark: NewMarkInput) => {
      const { data, error } = await supabase
        .from("marks")
        .insert({ ...mark, device_id: deviceId })
        .select()
        .single();

      if (error) throw error;
      return normalizeMark(data as Mark);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marks", deviceId] });
    },
  });
}

export function useDeleteMark() {
  const deviceId = useAppStore((s) => s.deviceId);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("marks")
        .delete()
        .eq("device_id", deviceId)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marks", deviceId] });
    },
  });
}

export function useSubjectMarksDetail(subjectId: string) {
  const { data: subjectMarks = [] } = useMarks(subjectId || "__none__");

  return useMemo(() => {
    const internalRecords = subjectMarks.filter((m) => !m.is_external);
    const externalRecord = subjectMarks.find((m) => m.is_external) ?? null;
    const internalScaled = scaleInternalTo60(internalRecords);
    const gradeResult = computeGradeResult(internalRecords, externalRecord);

    return {
      internalRecords,
      externalRecord,
      gradeResult,
      internalScaled,
    };
  }, [subjectMarks]);
}

export function useAllSubjectsSGPA() {
  const subjects = useAppStore((s) => s.subjects);
  const { data: allMarks = [] } = useMarks();

  return useMemo(() => {
    const results: SubjectSGPAResult[] = subjects.map((subject) => {
      const subjectMarks = allMarks.filter(
        (m) => m.subject_id === subject.id
      );
      const internalRecords = subjectMarks.filter((m) => !m.is_external);
      const externalRecord =
        subjectMarks.find((m) => m.is_external) ?? null;
      const gradeResult = externalRecord
        ? computeGradeResult(internalRecords, externalRecord)
        : null;

      return {
        subjectId: subject.id,
        subjectName: subject.name,
        credits: subject.credits,
        gradeResult,
        isComplete: externalRecord !== null,
      };
    });

    const sgpa = computeSGPA(results);
    return { results, sgpa };
  }, [subjects, allMarks]);
}
