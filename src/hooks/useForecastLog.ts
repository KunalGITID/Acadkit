import { useEffect, useRef } from "react";
import { logForecasts } from "@/api/queries";
import {
  useArchives,
  useAttendance,
  useDeadlines,
  useMarks,
  usePin,
  usePortalSnapshots,
  useSettings,
  useSubjects,
  useTimetable,
} from "@/hooks/useData";
import { semesterWindow } from "@/lib/calendar";
import { todayISO } from "@/lib/dates";
import { forecastRows, weekStart } from "@/lib/forecastLog";
import { gradeOdds } from "@/lib/odds";
import { historyOffsets } from "@/lib/pastRecord";
import { buildProjection } from "@/lib/projections";

/** The week this device last logged, per PIN - so the work happens once a week. */
const loggedKey = (pin: string) => `acadkit:forecast-week:${pin}`;

function readLogged(pin: string): string | null {
  try {
    return localStorage.getItem(loggedKey(pin));
  } catch {
    return null;
  }
}

function writeLogged(pin: string, week: string): void {
  try {
    localStorage.setItem(loggedKey(pin), week);
  } catch {
    // Storage disabled: the insert is idempotent, so logging again is harmless.
  }
}

/** Write this week's grade forecasts to the log, once. */
export function useForecastLog(): void {
  const pin = usePin();
  const settings = useSettings();
  const subjects = useSubjects();
  const attendance = useAttendance();
  const timetable = useTimetable();
  const marks = useMarks();
  const deadlines = useDeadlines();
  const snapshots = usePortalSnapshots();
  const archives = useArchives();
  const started = useRef(false);

  // Archives too: a forecast logged before they load would be made without your history.
  const queries = [settings, subjects, attendance, timetable, marks, deadlines, snapshots, archives];
  const fresh = queries.every((q) => q.isFetchedAfterMount && !q.isError && q.data !== undefined);

  useEffect(() => {
    if (!fresh || started.current || !pin || !subjects.data?.length) return;
    const week = weekStart(todayISO());
    if (readLogged(pin) === week) return;
    started.current = true;

    const s = settings.data;
    const report = buildProjection(
      subjects.data,
      attendance.data ?? [],
      timetable.data ?? [],
      marks.data ?? [],
      s?.declared_holidays ?? [],
      todayISO(),
      semesterWindow(s),
      s?.target_sgpa ?? 8.5,
      deadlines.data ?? [],
      s?.assumed_external_pct ?? null,
      snapshots.data ?? []
    );
    const history = historyOffsets(archives.data ?? [], subjects.data);
    const rows = forecastRows(pin, week, gradeOdds(report.gradeProjections, report.targetSgpa, undefined, history));
    logForecasts(rows)
      .then(() => writeLogged(pin, week))
      // Failed (offline, say): try again on the next load.
      .catch(() => {
        started.current = false;
      });
  }, [
    fresh,
    pin,
    settings.data,
    subjects.data,
    attendance.data,
    timetable.data,
    marks.data,
    deadlines.data,
    snapshots.data,
    archives.data,
  ]);
}
