export const ACADEMIC_CALENDAR: Record<string, number> = {
  "2026-07-21": 1,
  "2026-07-22": 2,
  "2026-07-23": 3,
  "2026-07-24": 4,
  "2026-07-27": 5,
  "2026-07-28": 1,
  "2026-07-29": 2,
  "2026-07-30": 3,
  "2026-07-31": 4,
  "2026-08-03": 5,
  "2026-08-04": 1,
  "2026-08-05": 2,
  "2026-08-06": 3,
  "2026-08-07": 4,
  "2026-08-10": 5,
  "2026-08-11": 1,
  "2026-08-12": 2,
  "2026-08-13": 3,
  "2026-08-14": 4,
  "2026-08-17": 5,
  "2026-08-18": 1,
  "2026-08-19": 2,
  "2026-08-20": 3,
  "2026-08-21": 4,
  "2026-08-24": 5,
  "2026-08-25": 1,
  "2026-08-27": 2,
  "2026-08-28": 3,
  "2026-08-31": 4,
  "2026-09-01": 5,
  "2026-09-02": 1,
  "2026-09-03": 2,
  "2026-09-07": 3,
  "2026-09-08": 4,
  "2026-09-09": 5,
  "2026-09-10": 1,
  "2026-09-11": 2,
  "2026-09-15": 3,
  "2026-09-16": 4,
  "2026-09-17": 5,
  "2026-09-18": 1,
  "2026-09-21": 2,
  "2026-09-22": 3,
  "2026-09-23": 4,
  "2026-09-24": 5,
  "2026-09-25": 1,
  "2026-09-28": 2,
  "2026-09-29": 3,
  "2026-09-30": 4,
  "2026-10-01": 5,
  "2026-10-05": 1,
  "2026-10-06": 2,
  "2026-10-07": 3,
  "2026-10-08": 4,
  "2026-10-09": 5,
  "2026-10-12": 1,
  "2026-10-13": 2,
  "2026-10-14": 3,
  "2026-10-15": 4,
  "2026-10-16": 5,
  "2026-10-21": 1,
  "2026-10-22": 2,
  "2026-10-23": 3,
  "2026-10-26": 4,
  "2026-10-27": 5,
  "2026-10-28": 1,
  "2026-10-29": 2,
  "2026-10-30": 3,
  "2026-11-02": 4,
  "2026-11-03": 5,
  "2026-11-04": 1,
  "2026-11-05": 2,
  "2026-11-06": 3,
  "2026-11-09": 4,
  "2026-11-10": 5,
  "2026-11-11": 1,
  "2026-11-12": 2,
  "2026-11-13": 3,
  "2026-11-16": 4,
  "2026-11-17": 5,
  "2026-11-18": 1,
};

export const SEM_START = "2026-07-21";
export const SEM_END = "2026-11-18";

export const OFFICIAL_HOLIDAYS: Record<string, string> = {
  "2026-08-26": "Milad-un-Nabi",
  "2026-09-04": "Krishna Jayanthi",
  "2026-09-14": "Vinayakar Chathurthi",
  "2026-10-02": "Gandhi Jayanthi",
  "2026-10-19": "Ayutha Pooja",
  "2026-10-20": "Vijaya Dasami",
  "2026-11-08": "Deepavali",
};

export function getTodayStatus(declaredHolidays: string[] = []) {
  const todayStr = new Date().toISOString().split("T")[0];
  const date = new Date(todayStr);
  const day = date.getDay();
  const isWeekend = day === 0 || day === 6;
  const officialHoliday = OFFICIAL_HOLIDAYS[todayStr];
  const isDeclaredHoliday = declaredHolidays.includes(todayStr);
  const isPreSemester = todayStr < SEM_START;
  const isPostSemester = todayStr > SEM_END;
  const isHoliday = !!(officialHoliday || isDeclaredHoliday);
  const dayOrder =
    !isWeekend && !isHoliday && !isPreSemester && !isPostSemester
      ? (ACADEMIC_CALENDAR[todayStr] ?? null)
      : null;

  return {
    dayOrder,
    isWeekend,
    isHoliday,
    holidayName:
      officialHoliday || (isDeclaredHoliday ? "Declared Holiday" : null),
    isPreSemester,
    isPostSemester,
    todayStr,
    isDeclaredHoliday,
  };
}

export function daysUntilSemesterStart(todayStr: string): number {
  const start = new Date(SEM_START);
  const today = new Date(todayStr);
  const diff = start.getTime() - today.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export function getNextCalendarDate(afterDate: string): string | null {
  const dates = Object.keys(ACADEMIC_CALENDAR).sort();
  return dates.find((d) => d > afterDate) ?? null;
}
