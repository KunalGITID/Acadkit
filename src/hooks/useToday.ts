import { useEffect, useMemo, useState } from "react";
import { getDayInfo, nextWorkingDate, semesterWindow, type DayInfo } from "@/lib/calendar";
import { toISODate } from "@/lib/dates";
import { dayIsOver } from "@/lib/liveClass";
import { useAttendance, useSettings, useTimetable, useSubjects } from "@/hooks/useData";
import type { DeclaredHoliday, Subject, TimetableSlot } from "@/types";

export interface TodaySlot {
  slot: TimetableSlot;
  subject: Subject | undefined;
}

function slotsForDayOrder(
  dayOrder: number | null,
  timetable: TimetableSlot[] | undefined,
  subjects: Subject[] | undefined
): TodaySlot[] {
  if (dayOrder === null || !timetable) return [];
  return timetable
    .filter((s) => s.day_order === dayOrder)
    .sort((a, b) => a.start_time.localeCompare(b.start_time))
    .map((slot) => ({ slot, subject: subjects?.find((s) => s.id === slot.subject_id) }));
}

/**
 * Today's resolved Day Order + class schedule, live across midnight.
 * Once every one of today's classes has ended, this rolls forward to
 * the next working day's schedule so the dashboard shows what's next
 * instead of a stale, fully-past list.
 *
 * That roll-forward makes `info` and `slots` describe a day that is not
 * necessarily today, which is a trap for anything comparing them
 * against the clock: at 2pm on a Day Order 3 whose classes ended at
 * 12:30, `info` is Day Order 4 and its 1:25 slot looks like it is
 * running right now. `today` is the same reading *without* the
 * roll-forward, and it is what any screen answering "what day is it"
 * or "is this class happening" must use. `isNextDay` says which of the
 * two `info` currently is.
 */
export function useToday() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(tick);
  }, []);
  const date = toISODate(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const { data: settings } = useSettings();
  const { data: timetable } = useTimetable();
  const { data: subjects } = useSubjects();
  const { data: attendance } = useAttendance();

  const declared: DeclaredHoliday[] = useMemo(
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

  const todayInfo: DayInfo = useMemo(
    () => getDayInfo(date, declared, semWindow),
    [date, declared, semWindow]
  );
  const todaySlots = useMemo(
    () => slotsForDayOrder(todayInfo.dayOrder, timetable, subjects),
    [todayInfo.dayOrder, timetable, subjects]
  );

  // A cancelled class is not something still to come, so it must not
  // hold the dashboard on a finished day until the hour it was never
  // going to run in.
  const allClassesDone = dayIsOver(todaySlots, nowMin, ({ slot }) =>
    attendance?.find(
      (r) =>
        r.subject_id === slot.subject_id && r.date === date && r.start_time === slot.start_time
    )?.status ?? null
  );

  const next = allClassesDone ? nextWorkingDate(date, declared, semWindow) : null;
  const isNextDay = next !== null;

  const info = next ?? todayInfo;
  const slots = next
    ? slotsForDayOrder(next.dayOrder, timetable, subjects)
    : todaySlots;

  return { date: info.date, info, today: todayInfo, slots, declared, isNextDay };
}
