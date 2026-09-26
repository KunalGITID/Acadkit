import { useMemo } from "react";
import { survivalPlanFrom, type SurvivalPlan } from "@/lib/survival";
import { buildEffectiveMap, semesterWindow } from "@/lib/calendar";
import { todayISO } from "@/lib/dates";
import {
  useAttendance,
  usePortalSnapshots,
  useSettings,
  useSubjects,
  useTimetable,
} from "@/hooks/useData";

/**
 * The survival plan, from the app's live data.
 *
 * Two places want this now — the dashboard card and the watcher that
 * notices when you spend a free day — and a third builds it from props
 * inside Insights. They must agree, so all three go through
 * `survivalPlanFrom`.
 *
 * Returns null rather than an empty plan when there is nothing to plan
 * with: no subjects, or no timetable to spend days against.
 */
export function useSurvivalPlan(): SurvivalPlan | null {
  const { data: subjects } = useSubjects();
  const { data: attendance } = useAttendance();
  const { data: snapshots } = usePortalSnapshots();
  const { data: timetable } = useTimetable();
  const { data: settings } = useSettings();

  const semStart = settings?.sem_start ?? null;
  const semEnd = settings?.sem_end ?? null;
  const declared = settings?.declared_holidays;

  return useMemo(() => {
    if (!subjects?.length || !timetable?.length) return null;
    const effMap = buildEffectiveMap(
      declared ?? [],
      semesterWindow({ sem_start: semStart, sem_end: semEnd })
    );
    return survivalPlanFrom(subjects, attendance ?? [], snapshots ?? [], timetable, effMap, todayISO());
  }, [subjects, attendance, snapshots, timetable, declared, semStart, semEnd]);
}
