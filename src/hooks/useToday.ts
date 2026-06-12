import { useEffect, useMemo, useState } from "react";
import { getDayInfo, type DayInfo } from "@/lib/calendar";
import { todayISO } from "@/lib/dates";
import { useSettings, useTimetable, useSubjects } from "@/hooks/useData";
import type { DeclaredHoliday, Subject, TimetableSlot } from "@/types";

export interface TodaySlot {
  slot: TimetableSlot;
  subject: Subject | undefined;
}

/** Today's resolved Day Order + class schedule, live across midnight. */
export function useToday() {
  const [date, setDate] = useState(todayISO());
  useEffect(() => {
    const tick = setInterval(() => {
      const now = todayISO();
      setDate((prev) => (prev === now ? prev : now));
    }, 30_000);
    return () => clearInterval(tick);
  }, []);

  const { data: settings } = useSettings();
  const { data: timetable } = useTimetable();
  const { data: subjects } = useSubjects();

  const declared: DeclaredHoliday[] = useMemo(
    () => settings?.declared_holidays ?? [],
    [settings?.declared_holidays]
  );
  const info: DayInfo = useMemo(() => getDayInfo(date, declared), [date, declared]);

  const slots: TodaySlot[] = useMemo(() => {
    if (info.dayOrder === null || !timetable) return [];
    return timetable
      .filter((s) => s.day_order === info.dayOrder)
      .sort((a, b) => a.start_time.localeCompare(b.start_time))
      .map((slot) => ({
        slot,
        subject: subjects?.find((s) => s.id === slot.subject_id),
      }));
  }, [info.dayOrder, timetable, subjects]);

  return { date, info, slots, declared };
}
