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

/** The survival plan, from the app's live data. */
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
