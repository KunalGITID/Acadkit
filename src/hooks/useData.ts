import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import * as api from "@/api/queries";
import { type MutationEnvelope, type MutationName } from "@/api/mutations";
import { broadcastInvalidate } from "@/lib/broadcast";
import { useAppStore } from "@/store/app";
import type { PendingMark } from "@/lib/autoMark";
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
 *
 * The write itself is named rather than passed. Offline, React Query
 * pauses a mutation instead of failing it, so `onError` never fires and
 * the optimistic value stays in a cache that is persisted to
 * localStorage — but the mutation's own function is a closure that dies
 * with the page. Close the app and the edit was on screen, in storage,
 * and never sent; the next refetch silently replaced it with the server's
 * older truth. Naming the write lets it be restored and replayed
 * (src/api/mutations.ts), which is what the offline banner has always
 * claimed happens.
 *
 * Variables travel wrapped with the pin for the same reason: a replay
 * has no store to read it from. Callers never see the envelope — mutate
 * still takes the plain variables.
 */
function useOptimistic<TVars, TData>(opts: {
  pin: string;
  name: MutationName;
  root: string;
  extraRoots?: string[];
  updater: (old: TData | undefined, vars: TVars) => TData | undefined;
  errorMessage?: string;
}) {
  const qc = useQueryClient();
  const key = [opts.root, opts.pin];
  const m = useMutation({
    // No mutationFn: it comes from the defaults registered against this
    // key, so a rehydrated copy of this mutation resolves the same one.
    mutationKey: [opts.name],
    onMutate: async ({ vars }: MutationEnvelope<TVars>) => {
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

  const pin = opts.pin;
  return {
    ...m,
    mutate: (vars: TVars) => m.mutate({ pin, vars }),
    mutateAsync: (vars: TVars) => m.mutateAsync({ pin, vars }),
  };
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
    name: "settings.update",
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
    name: "subjects.add",
    updater: (old, s) => [...(old ?? []), { ...s, id: tempId(), device_id: pin }],
  });
}

export function useUpdateSubject() {
  const pin = usePin();
  return useOptimistic<{ id: string; patch: Partial<Subject> }, Subject[]>({
    pin,
    root: "subjects",
    name: "subjects.update",
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
    name: "subjects.delete",
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
    name: "timetable.add",
    updater: (old, slot) => [...(old ?? []), { ...slot, id: tempId(), device_id: pin }],
  });
}

export function useUpdateSlot() {
  const pin = usePin();
  return useOptimistic<{ id: string; patch: Partial<TimetableSlot> }, TimetableSlot[]>({
    pin,
    root: "timetable",
    name: "timetable.update",
    updater: (old, { id, patch }) =>
      old?.map((s) => (s.id === id ? { ...s, ...patch } : s)),
  });
}

export function useDeleteSlot() {
  const pin = usePin();
  return useOptimistic<string, TimetableSlot[]>({
    pin,
    root: "timetable",
    name: "timetable.delete",
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
    name: "attendance.mark",
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
    name: "attendance.unmark",
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

/**
 * Fill in every past unmarked class as present. Not optimistic: the row
 * count matters to the user, and a bulk write that quietly rolled back
 * would leave the attendance page lying.
 */
export function useAutoMark() {
  const pin = usePin();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rows: PendingMark[]) => api.insertAutoMarks(pin, rows),
    onSuccess: (count) => {
      void qc.invalidateQueries({ queryKey: ["attendance", pin] });
      broadcastInvalidate(["attendance"]);
      toast.success(
        count ? `Marked ${count} past class${count > 1 ? "es" : ""} present` : "Already up to date"
      );
    },
    onError: () => toast.error("Couldn't auto-mark attendance"),
  });
}

/** Undo: delete only the rows auto-marking created. */
export function useClearAutoMarks() {
  const pin = usePin();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.deleteAutoMarks(pin),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["attendance", pin] });
      broadcastInvalidate(["attendance"]);
      toast.success("Removed auto-marked classes");
    },
    onError: () => toast.error("Couldn't remove auto-marked classes"),
  });
}

export function useMarks() {
  const pin = usePin();
  return useQuery({
    queryKey: ["marks", pin],
    queryFn: () => api.fetchMarks(pin),
  });
}

/**
 * Portal attendance snapshots written by the sync bookmarklet.
 * Empty until migration 012 runs, which just falls back to manual counts.
 */
export function usePortalSnapshots() {
  const pin = usePin();
  return useQuery({
    queryKey: ["portal_snapshots", pin],
    queryFn: () => api.fetchPortalSnapshots(pin),
  });
}

export function useAddMark() {
  const pin = usePin();
  return useOptimistic<Omit<Mark, "id" | "device_id" | "added_at">, Mark[]>({
    pin,
    root: "marks",
    name: "marks.add",
    updater: (old, mark) => [...(old ?? []), { ...mark, id: tempId(), device_id: pin }],
  });
}

export function useUpdateMark() {
  const pin = usePin();
  return useOptimistic<{ id: string; patch: Partial<Mark> }, Mark[]>({
    pin,
    root: "marks",
    name: "marks.update",
    updater: (old, { id, patch }) =>
      old?.map((m) => (m.id === id ? { ...m, ...patch } : m)),
  });
}

export function useDeleteMark() {
  const pin = usePin();
  return useOptimistic<string, Mark[]>({
    pin,
    root: "marks",
    name: "marks.delete",
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
    name: "archives.delete",
    updater: (old, id) => old?.filter((a) => a.id !== id),
  });
}

export function useAddDeadline() {
  const pin = usePin();
  return useOptimistic<Omit<Deadline, "id" | "device_id" | "created_at">, Deadline[]>({
    pin,
    root: "deadlines",
    name: "deadlines.add",
    updater: (old, d) => [...(old ?? []), { ...d, id: tempId(), device_id: pin }],
  });
}

export function useUpdateDeadline() {
  const pin = usePin();
  return useOptimistic<{ id: string; patch: Partial<Deadline> }, Deadline[]>({
    pin,
    root: "deadlines",
    name: "deadlines.update",
    updater: (old, { id, patch }) =>
      old?.map((d) => (d.id === id ? { ...d, ...patch } : d)),
  });
}

export function useDeleteDeadline() {
  const pin = usePin();
  return useOptimistic<string, Deadline[]>({
    pin,
    root: "deadlines",
    name: "deadlines.delete",
    updater: (old, id) => old?.filter((d) => d.id !== id),
  });
}
