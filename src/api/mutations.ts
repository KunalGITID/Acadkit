import type { QueryClient } from "@tanstack/react-query";
import * as api from "@/api/queries";

/**
 * Every write the app can make, addressable by name.
 *
 * The reason this exists rather than each hook closing over its own
 * function: React Query can only replay a mutation it can still find a
 * function for. A mutation restored from localStorage after the app was
 * killed has nothing but a key and its variables — the closure died with
 * the page — so unless the key resolves to a function here, the write is
 * gone. See registerMutationDefaults below.
 *
 * `pin` is passed rather than captured for the same reason: at replay
 * time there is no component and no store, only what was persisted.
 */
export type MutationName = keyof typeof MUTATION_FNS;

/* eslint-disable @typescript-eslint/no-explicit-any */
export const MUTATION_FNS = {
  "settings.update": (pin: string, v: any) => api.updateSettings(pin, v),

  "subjects.add": (pin: string, v: any) => api.insertSubject(pin, v),
  "subjects.update": (_pin: string, v: any) => api.updateSubject(v.id, v.patch),
  "subjects.delete": (_pin: string, v: any) => api.deleteSubject(v),

  "timetable.add": (pin: string, v: any) => api.insertSlot(pin, v),
  "timetable.update": (_pin: string, v: any) => api.updateSlot(v.id, v.patch),
  "timetable.delete": (_pin: string, v: any) => api.deleteSlot(v),

  "attendance.mark": (pin: string, v: any) => api.upsertAttendance(pin, v),
  "attendance.unmark": (pin: string, v: any) => api.deleteAttendance(pin, v),

  "marks.add": (pin: string, v: any) => api.insertMark(pin, v),
  "marks.update": (_pin: string, v: any) => api.updateMark(v.id, v.patch),
  "marks.delete": (_pin: string, v: any) => api.deleteMark(v),

  "deadlines.add": (pin: string, v: any) => api.insertDeadline(pin, v),
  "deadlines.update": (_pin: string, v: any) => api.updateDeadline(v.id, v.patch),
  "deadlines.delete": (_pin: string, v: any) => api.deleteDeadline(v),

  "archives.delete": (_pin: string, v: any) => api.deleteArchive(v),
} satisfies Record<string, (pin: string, vars: any) => Promise<unknown>>;
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * What a paused mutation carries across a restart: which write it was,
 * and whose data it belongs to. The pin travels with the variables
 * instead of being read back from storage at replay time, so a queued
 * edit can never land on a different account than the one that made it.
 */
export interface MutationEnvelope<TVars> {
  pin: string;
  vars: TVars;
}

/**
 * Teach the client how to run each mutation by name, so mutations
 * rehydrated from storage have a function to call.
 *
 * Must run before the persisted cache is restored — i.e. at module
 * scope next to the QueryClient, not inside a component.
 */
export function registerMutationDefaults(qc: QueryClient): void {
  for (const name of Object.keys(MUTATION_FNS) as MutationName[]) {
    qc.setMutationDefaults([name], {
      mutationFn: (envelope: unknown) => {
        const { pin, vars } = envelope as MutationEnvelope<unknown>;
        return MUTATION_FNS[name](pin, vars);
      },
    });
  }
}
