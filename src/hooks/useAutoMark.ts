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
 *
 * Waits until settings, timetable and attendance have all been fetched
 * in this session. The first data on screen comes from the persisted
 * cache, which can be a week old: guessing against it wrote "present"
 * rows for a timetable since replaced, and those then showed up as
 * extra classes.
 */
export function useAutoMarkRunner(): void {
  const settingsQ = useSettings();
  const timetableQ = useTimetable();
  const attendanceQ = useAttendance();
  const pending = usePendingAutoMarks();
  const autoMark = useAutoMark();
  const ran = useRef(false);

  const enabled = settingsQ.data?.auto_mark_present === true;
  const fresh = [settingsQ, timetableQ, attendanceQ].every(
    (q) => q.isFetchedAfterMount && !q.isError
  );

  useEffect(() => {
    if (!enabled || !fresh || ran.current || !pending.length) return;
    ran.current = true;
    autoMark.mutate(pending);
  }, [enabled, fresh, pending, autoMark]);
}
