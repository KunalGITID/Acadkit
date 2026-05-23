import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useMemo } from "react";
import { getTodayStatus } from "@/lib/academicCalendar";
import {
  computeAttendanceStats,
  getLocalDateString,
} from "@/lib/attendance";
import { normalizeTime } from "@/lib/constants";
import { supabase } from "@/lib/supabase";
import { getAttendanceForDevice } from "@/lib/queries";
import { useTodaySlots } from "@/hooks/useTimetable";
import { useAppStore } from "@/store/useAppStore";
import type { Attendance, TimetableSlotWithSubject } from "@/types/database";

export type MarkAttendanceInput = {
  subject_id: string;
  date: string;
  status: "present" | "absent" | "holiday";
  start_time: string;
  end_time: string;
};

export type TodaySlotAttendance = {
  slot: TimetableSlotWithSubject;
  status: "present" | "absent" | "holiday" | "unmarked";
  recordId?: string;
};

function matchRecord(
  records: Attendance[],
  subjectId: string,
  date: string,
  startTime: string
): Attendance | undefined {
  const start = normalizeTime(startTime);
  return records.find(
    (r) =>
      r.subject_id === subjectId &&
      r.date === date &&
      normalizeTime(r.start_time) === start
  );
}

export function useAttendance(subjectId?: string) {
  const deviceId = useAppStore((s) => s.deviceId);

  return useQuery({
    queryKey: ["attendance", deviceId, subjectId ?? "all"],
    queryFn: async () => {
      const records = await getAttendanceForDevice(deviceId);
      const sorted = [...records].sort((a, b) =>
        b.date.localeCompare(a.date)
      );
      if (!subjectId) return sorted;
      return sorted.filter((r) => r.subject_id === subjectId);
    },
  });
}

export function useAttendanceStats() {
  const subjects = useAppStore((s) => s.subjects);
  const { data: attendance = [] } = useAttendance();

  return useMemo(() => {
    const stats = subjects.map((subject) => {
      const records = attendance.filter((r) => r.subject_id === subject.id);
      return computeAttendanceStats(
        subject.id,
        subject.name,
        subject.color_hex,
        records
      );
    });
    return stats.sort((a, b) => a.percentage - b.percentage);
  }, [subjects, attendance]);
}

export function useMarkAttendance() {
  const deviceId = useAppStore((s) => s.deviceId);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: MarkAttendanceInput) => {
      const row = {
        device_id: deviceId,
        subject_id: input.subject_id,
        date: input.date,
        status: input.status,
        start_time: normalizeTime(input.start_time),
        end_time: normalizeTime(input.end_time),
      };

      const { data, error } = await supabase
        .from("attendance")
        .upsert(row, {
          onConflict: "device_id,subject_id,date,start_time",
        })
        .select()
        .single();

      if (error) throw error;
      return {
        ...data,
        start_time: normalizeTime(data.start_time),
        end_time: normalizeTime(data.end_time),
      } as Attendance;
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ["attendance", deviceId] });

      const previous = queryClient.getQueriesData<Attendance[]>({
        queryKey: ["attendance", deviceId],
      });

      const optimistic: Attendance = {
        id: `temp-${crypto.randomUUID()}`,
        device_id: deviceId,
        subject_id: input.subject_id,
        date: input.date,
        status: input.status,
        start_time: normalizeTime(input.start_time),
        end_time: normalizeTime(input.end_time),
      };

      queryClient.setQueriesData<Attendance[]>(
        { queryKey: ["attendance", deviceId] },
        (old = []) => {
          const start = normalizeTime(input.start_time);
          const idx = old.findIndex(
            (r) =>
              r.subject_id === input.subject_id &&
              r.date === input.date &&
              normalizeTime(r.start_time) === start
          );
          if (idx >= 0) {
            const next = [...old];
            next[idx] = optimistic;
            return next;
          }
          return [...old, optimistic];
        }
      );

      return { previous };
    },
    onError: (_err, _input, context) => {
      context?.previous.forEach(([key, data]) => {
        queryClient.setQueryData(key, data);
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance", deviceId] });
    },
  });
}

export function useTodayAttendance(): TodaySlotAttendance[] {
  const settings = useAppStore((s) => s.settings);
  const todaySlots = useTodaySlots();
  const { data: allAttendance = [] } = useAttendance();
  const todayStr = getLocalDateString();

  return useMemo(() => {
    const declared = settings?.declared_holidays ?? [];
    const status = getTodayStatus(declared);

    if (
      status.isWeekend ||
      status.isHoliday ||
      status.isPreSemester ||
      status.isPostSemester ||
      status.dayOrder === null
    ) {
      return [];
    }

    const todayRecords = allAttendance.filter((r) => r.date === todayStr);

    return todaySlots.map((slot) => {
      const record = matchRecord(
        todayRecords,
        slot.subject_id,
        todayStr,
        slot.start_time
      );
      return {
        slot,
        status: record?.status ?? "unmarked",
        recordId: record?.id,
      };
    });
  }, [settings?.declared_holidays, todaySlots, allAttendance, todayStr]);
}
