import { useEffect, useRef } from "react";
import { logForecasts } from "@/api/queries";
import {
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
import { buildProjection } from "@/lib/projections";

/** The week this device last logged, per PIN — so the work happens once a week. */
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

/**
 * Write this week's grade forecasts to the log, once.
 *
 * Runs behind the app on the first load of each week, off data fetched
 * in this session — never off the persisted cache, which can be a week
 * old and would log a stale forecast as this week's. Any device may do
 * it; the table keeps the first row for a week and ignores the rest.
 */
export function useForecastLog(): void {
  const pin = usePin();
  const settings = useSettings();
  const subjects = useSubjects();
  const attendance = useAttendance();
  const timetable = useTimetable();
  const marks = useMarks();
  const deadlines = useDeadlines();
  const snapshots = usePortalSnapshots();
  const started = useRef(false);

  const queries = [settings, subjects, attendance, timetable, marks, deadlines, snapshots];
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
    const rows = forecastRows(pin, week, gradeOdds(report.gradeProjections, report.targetSgpa));
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
  ]);
}
