import { useEffect, useMemo, useState } from "react";
import { getDayInfo, nextWorkingDate, semesterWindow, type DayInfo } from "@/lib/calendar";
import { timeToMinutes, toISODate } from "@/lib/dates";
import { useSettings, useTimetable, useSubjects } from "@/hooks/useData";
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

  const declared: DeclaredHoliday[] = useMemo(
    () => settings?.declared_holidays ?? [],
    [settings?.declared_holidays]
  );
  const semWindow = useMemo(
    () => semesterWindow(settings),
    [settings?.sem_start, settings?.sem_end]
  );

  const todayInfo: DayInfo = useMemo(
    () => getDayInfo(date, declared, semWindow),
    [date, declared, semWindow]
  );
  const todaySlots = useMemo(
    () => slotsForDayOrder(todayInfo.dayOrder, timetable, subjects),
    [todayInfo.dayOrder, timetable, subjects]
  );

  const allClassesDone =
    todaySlots.length > 0 && todaySlots.every(({ slot }) => nowMin > timeToMinutes(slot.end_time));

  const next = allClassesDone ? nextWorkingDate(date, declared, semWindow) : null;
  const isNextDay = next !== null;

  const info = next ?? todayInfo;
  const slots = next
    ? slotsForDayOrder(next.dayOrder, timetable, subjects)
    : todaySlots;

  return { date: info.date, info, slots, declared, isNextDay };
}
