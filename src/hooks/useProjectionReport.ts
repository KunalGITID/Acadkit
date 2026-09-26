import { useMemo } from "react";
import {
  useAttendance,
  useDeadlines,
  useMarks,
  usePortalSnapshots,
  useSettings,
  useSubjects,
  useTimetable,
} from "@/hooks/useData";
import { buildProjection } from "@/lib/projections";
import { buildEffectiveMap, semesterWindow } from "@/lib/calendar";
import { gradeOdds } from "@/lib/odds";
import { todayISO } from "@/lib/dates";

/**
 * The projection report and grade odds, as Attendance, Marks and the
 * survival plan read them.
 *
 * These used to be computed inside the Insights page. Now that the
 * attendance forecast lives on Attendance and the grade budget on Marks,
 * both call this, so the two screens can't drift onto different inputs.
 */
export function useProjectionReport() {
  const { data: subjects, isLoading: sL } = useSubjects();
  const { data: attendance, isLoading: aL } = useAttendance();
  const { data: timetable, isLoading: tL } = useTimetable();
  const { data: marks, isLoading: mL } = useMarks();
  const { data: deadlines } = useDeadlines();
  const { data: settings } = useSettings();
  const { data: snapshots } = usePortalSnapshots();

  const declared = useMemo(
    () => settings?.declared_holidays ?? [],
    [settings?.declared_holidays]
  );
  // Depend on the two fields, not the settings object: React Query
  // hands back a new object on every refetch, so listing `settings`
  // would satisfy the linter by defeating the memo.
  const semStart = settings?.sem_start ?? null;
  const semEnd = settings?.sem_end ?? null;
  const semWindow = useMemo(
    () => semesterWindow({ sem_start: semStart, sem_end: semEnd }),
    [semStart, semEnd]
  );
  // Working days ahead, declared holidays already shifted out.
  const effMap = useMemo(
    () => buildEffectiveMap(declared, semWindow),
    [declared, semWindow]
  );
  const report = useMemo(
    () =>
      buildProjection(
        subjects ?? [],
        attendance ?? [],
        timetable ?? [],
        marks ?? [],
        declared,
        todayISO(),
        semWindow,
        // A subject with no target of its own inherits the one implied
        // by the target SGPA, so the two can never disagree.
        settings?.target_sgpa ?? 8.5,
        deadlines ?? [],
        settings?.assumed_external_pct ?? null,
        // The portal baseline, as on the Attendance page — without it
        // this counted hand-marked classes only.
        snapshots ?? []
      ),
    [
      subjects,
      attendance,
      timetable,
      marks,
      declared,
      semWindow,
      settings?.target_sgpa,
      settings?.assumed_external_pct,
      deadlines,
      snapshots,
    ]
  );
  // Odds for every grade, simulated from the same projections the cards
  // are built from, so a card and its odds can't be about different marks.
  const odds = useMemo(
    () => gradeOdds(report.gradeProjections, report.targetSgpa),
    [report]
  );

  return {
    report,
    odds,
    declared,
    semWindow,
    effMap,
    subjects: subjects ?? [],
    attendance: attendance ?? [],
    timetable: timetable ?? [],
    snapshots: snapshots ?? [],
    isLoading: sL || aL || tL || mL,
  };
}
