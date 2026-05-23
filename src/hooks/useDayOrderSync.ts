import { useEffect } from "react";
import { getTodayStatus } from "@/lib/academicCalendar";
import { useAppStore } from "@/store/useAppStore";

export function useDayOrderSync() {
  const settings = useAppStore((s) => s.settings);
  const setTodayDayOrder = useAppStore((s) => s.setTodayDayOrder);

  useEffect(() => {
    const declared = settings?.declared_holidays ?? [];
    const status = getTodayStatus(declared);
    setTodayDayOrder(status.dayOrder);
  }, [settings?.declared_holidays, setTodayDayOrder]);
}
