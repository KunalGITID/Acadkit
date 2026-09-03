import { useEffect, useMemo, useRef } from "react";
import { buildEffectiveMap, semesterWindow } from "@/lib/calendar";
import { pendingAutoMarks, type PendingMark } from "@/lib/autoMark";
import { toISODate } from "@/lib/dates";
import {
  useAttendance,
  useAutoMark,
  useSettings,
  useTimetable,
} from "@/hooks/useData";

/**
 * What auto-marking would write right now, given the live data.
 * Exposed on its own so Settings can show the count before the user
 * commits to anything.
 */
export function usePendingAutoMarks(): PendingMark[] {
  const { data: settings } = useSettings();
  const { data: timetable } = useTimetable();
  const { data: attendance } = useAttendance();

  return useMemo(() => {
    if (!settings || !timetable?.length || !attendance) return [];
    const window = semesterWindow(settings);
    const effMap = buildEffectiveMap(settings.declared_holidays ?? [], window);
    return pendingAutoMarks(
      timetable,
      effMap,
      attendance,
      toISODate(new Date()),
      window.start
    );
  }, [settings, timetable, attendance]);
}

/**
 * Runs the catch-up once per app load when the setting is on.
 *
 * Guarded by a ref rather than a dependency list: the write invalidates
 * the attendance query, which recomputes the pending list, which would
 * otherwise re-trigger this effect in a loop.
 */
export function useAutoMarkRunner(): void {
  const { data: settings } = useSettings();
  const pending = usePendingAutoMarks();
  const autoMark = useAutoMark();
  const ran = useRef(false);

  const enabled = settings?.auto_mark_present === true;

  useEffect(() => {
    if (!enabled || ran.current || !pending.length) return;
    ran.current = true;
    autoMark.mutate(pending);
  }, [enabled, pending, autoMark]);
}
