import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import * as api from "@/api/queries";
import { broadcastInvalidate } from "@/lib/broadcast";
import { useAppStore } from "@/store/app";
import type {
  AttendanceRecord,
  Deadline,
  Mark,
  SemesterArchive,
  Settings,
  Subject,
  TimetableSlot,
} from "@/types";

// Falls back to the last known PIN so components kept alive briefly
// during teardown (exit animations, PIN reset) don't crash the tree.
let lastPin = "";

export function usePin(): string {
  const pin = useAppStore((s) => s.pin);
  if (pin) lastPin = pin;
  return pin ?? lastPin;
}

const tempId = () => `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function invalidate(qc: QueryClient, pin: string, roots: string[]) {
  for (const root of roots) void qc.invalidateQueries({ queryKey: [root, pin] });
  broadcastInvalidate(roots);
}

/**
 * Generic optimistic mutation over a single list/object query.
 * Applies `updater` to the cache immediately, rolls back on error,
 * and refetches (+ notifies other tabs) when settled.
 */
function useOptimistic<TVars, TData>(opts: {
  pin: string;
  root: string;
  extraRoots?: string[];
  mutationFn: (vars: TVars) => Promise<void>;
  updater: (old: TData | undefined, vars: TVars) => TData | undefined;
  errorMessage?: string;
}) {
  const qc = useQueryClient();
  const key = [opts.root, opts.pin];
  return useMutation({
    mutationFn: opts.mutationFn,
    onMutate: async (vars: TVars) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<TData>(key);
      qc.setQueryData<TData>(key, (old) => opts.updater(old, vars));
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      if (ctx) qc.setQueryData(key, ctx.prev);
      toast.error(opts.errorMessage ?? "Couldn't save — check your connection", {
        description: err instanceof Error ? err.message : undefined,
      });
    },
    onSettled: () => invalidate(qc, opts.pin, [opts.root, ...(opts.extraRoots ?? [])]),
  });
}

// ---------- settings ----------

export function useSettings() {
  const pin = usePin();
  return useQuery({
    queryKey: ["settings", pin],
    queryFn: () => api.fetchSettings(pin),
  });
}

export function useUpdateSettings() {
  const pin = usePin();
  return useOptimistic<Partial<Settings>, Settings | null>({
    pin,
    root: "settings",
    mutationFn: (patch) => api.updateSettings(pin, patch),
    updater: (old, patch) => (old ? { ...old, ...patch } : old),
  });
}

// ---------- subjects ----------

export function useSubjects() {
  const pin = usePin();
  return useQuery({
    queryKey: ["subjects", pin],
    queryFn: () => api.fetchSubjects(pin),
  });
}

export function useAddSubject() {
  const pin = usePin();
  return useOptimistic<Omit<Subject, "id" | "device_id" | "created_at">, Subject[]>({
    pin,
    root: "subjects",
    mutationFn: (s) => api.insertSubject(pin, s),
    updater: (old, s) => [...(old ?? []), { ...s, id: tempId(), device_id: pin }],
  });
}

export function useUpdateSubject() {
  const pin = usePin();
  return useOptimistic<{ id: string; patch: Partial<Subject> }, Subject[]>({
    pin,
    root: "subjects",
    mutationFn: ({ id, patch }) => api.updateSubject(id, patch),
    updater: (old, { id, patch }) =>
      old?.map((s) => (s.id === id ? { ...s, ...patch } : s)),
  });
}

export function useDeleteSubject() {
  const pin = usePin();
  return useOptimistic<string, Subject[]>({
    pin,
    root: "subjects",
    extraRoots: ["timetable", "attendance", "marks"],
    mutationFn: (id) => api.deleteSubject(id),
    updater: (old, id) => old?.filter((s) => s.id !== id),
  });
}

// ---------- timetable ----------

export function useTimetable() {
  const pin = usePin();
  return useQuery({
    queryKey: ["timetable", pin],
    queryFn: () => api.fetchTimetable(pin),
  });
}

export function useAddSlot() {
  const pin = usePin();
  return useOptimistic<Omit<TimetableSlot, "id" | "device_id" | "created_at">, TimetableSlot[]>({
    pin,
    root: "timetable",
    mutationFn: (slot) => api.insertSlot(pin, slot),
    updater: (old, slot) => [...(old ?? []), { ...slot, id: tempId(), device_id: pin }],
  });
}

export function useUpdateSlot() {
  const pin = usePin();
  return useOptimistic<{ id: string; patch: Partial<TimetableSlot> }, TimetableSlot[]>({
    pin,
    root: "timetable",
    mutationFn: ({ id, patch }) => api.updateSlot(id, patch),
    updater: (old, { id, patch }) =>
      old?.map((s) => (s.id === id ? { ...s, ...patch } : s)),
  });
}

export function useDeleteSlot() {
  const pin = usePin();
  return useOptimistic<string, TimetableSlot[]>({
    pin,
    root: "timetable",
    mutationFn: (id) => api.deleteSlot(id),
    updater: (old, id) => old?.filter((s) => s.id !== id),
  });
}

// ---------- attendance ----------

export function useAttendance() {
  const pin = usePin();
  return useQuery({
    queryKey: ["attendance", pin],
    queryFn: () => api.fetchAttendance(pin),
  });
}

export type AttendanceUpsert = Omit<AttendanceRecord, "id" | "device_id">;

export function useMarkAttendance() {
  const pin = usePin();
  return useOptimistic<AttendanceUpsert, AttendanceRecord[]>({
    pin,
    root: "attendance",
    mutationFn: (record) => api.upsertAttendance(pin, record),
    updater: (old, record) => {
      const rest = (old ?? []).filter(
        (r) =>
          !(
            r.subject_id === record.subject_id &&
            r.date === record.date &&
            r.start_time === record.start_time
          )
      );
      return [{ ...record, id: tempId(), device_id: pin }, ...rest];
    },
    errorMessage: "Couldn't mark attendance",
  });
}

export function useUnmarkAttendance() {
  const pin = usePin();
  return useOptimistic<
    { subject_id: string; date: string; start_time: string },
    AttendanceRecord[]
  >({
    pin,
    root: "attendance",
    mutationFn: (key) => api.deleteAttendance(pin, key),
    updater: (old, key) =>
      old?.filter(
        (r) =>
          !(
            r.subject_id === key.subject_id &&
            r.date === key.date &&
            r.start_time === key.start_time
          )
      ),
  });
}

// ---------- marks ----------

export function useMarks() {
  const pin = usePin();
  return useQuery({
    queryKey: ["marks", pin],
    queryFn: () => api.fetchMarks(pin),
  });
}

export function useAddMark() {
  const pin = usePin();
  return useOptimistic<Omit<Mark, "id" | "device_id" | "added_at">, Mark[]>({
    pin,
    root: "marks",
    mutationFn: (mark) => api.insertMark(pin, mark),
    updater: (old, mark) => [...(old ?? []), { ...mark, id: tempId(), device_id: pin }],
  });
}

export function useUpdateMark() {
  const pin = usePin();
  return useOptimistic<{ id: string; patch: Partial<Mark> }, Mark[]>({
    pin,
    root: "marks",
    mutationFn: ({ id, patch }) => api.updateMark(id, patch),
    updater: (old, { id, patch }) =>
      old?.map((m) => (m.id === id ? { ...m, ...patch } : m)),
  });
}

export function useDeleteMark() {
  const pin = usePin();
  return useOptimistic<string, Mark[]>({
    pin,
    root: "marks",
    mutationFn: (id) => api.deleteMark(id),
    updater: (old, id) => old?.filter((m) => m.id !== id),
  });
}

// ---------- deadlines ----------

export function useDeadlines() {
  const pin = usePin();
  return useQuery({
    queryKey: ["deadlines", pin],
    queryFn: () => api.fetchDeadlines(pin),
  });
}

// ---------- semester archives ----------

export function useArchives() {
  const pin = usePin();
  return useQuery({
    queryKey: ["archives", pin],
    queryFn: () => api.fetchArchives(pin),
  });
}

export function useDeleteArchive() {
  const pin = usePin();
  return useOptimistic<string, SemesterArchive[]>({
    pin,
    root: "archives",
    mutationFn: (id) => api.deleteArchive(id),
    updater: (old, id) => old?.filter((a) => a.id !== id),
  });
}

export function useAddDeadline() {
  const pin = usePin();
  return useOptimistic<Omit<Deadline, "id" | "device_id" | "created_at">, Deadline[]>({
    pin,
    root: "deadlines",
    mutationFn: (d) => api.insertDeadline(pin, d),
    updater: (old, d) => [...(old ?? []), { ...d, id: tempId(), device_id: pin }],
  });
}

export function useUpdateDeadline() {
  const pin = usePin();
  return useOptimistic<{ id: string; patch: Partial<Deadline> }, Deadline[]>({
    pin,
    root: "deadlines",
    mutationFn: ({ id, patch }) => api.updateDeadline(id, patch),
    updater: (old, { id, patch }) =>
      old?.map((d) => (d.id === id ? { ...d, ...patch } : d)),
  });
}

export function useDeleteDeadline() {
  const pin = usePin();
  return useOptimistic<string, Deadline[]>({
    pin,
    root: "deadlines",
    mutationFn: (id) => api.deleteDeadline(id),
    updater: (old, id) => old?.filter((d) => d.id !== id),
  });
}
