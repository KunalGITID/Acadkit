import { OFFICIAL_HOLIDAYS, SEMESTER_START, SEMESTER_END } from "@/data/semester";
import type { DeclaredHoliday, Settings } from "@/types";
import { addDays, isWeekend, diffDays, todayISO } from "@/lib/dates";

export type DayKind =
  | "working" // has a day order
  | "weekend"
  | "official-holiday"
  | "declared-holiday"
  | "pre-semester"
  | "post-semester"
  | "no-class"; // inside semester, weekday, but not in the map

export interface DayInfo {
  date: string;
  kind: DayKind;
  dayOrder: number | null;
  holidayName?: string;
}

export interface SemesterWindow {
  start: string;
  end: string;
}

/**
 * The active semester window. Falls back to the built-in default
 * (`src/data/semester.ts`) until the user sets custom dates in
 * Settings → Semester dates.
 */
export function semesterWindow(
  settings?: Pick<Settings, "sem_start" | "sem_end"> | null
): SemesterWindow {
  return {
    start: settings?.sem_start || SEMESTER_START,
    end: settings?.sem_end || SEMESTER_END,
  };
}

/**
 * Rotating Day Order 1–5 across every weekday in the window that isn't
 * an official holiday. Declared holidays are layered on top afterwards
 * so they can auto-shift the remaining rotation forward.
 */
function generateDayOrderMap(window: SemesterWindow): Record<string, number> {
  const map: Record<string, number> = {};
  let order = 1;
  for (let d = window.start; d <= window.end; d = addDays(d, 1)) {
    if (isWeekend(d) || OFFICIAL_HOLIDAYS[d]) continue;
    map[d] = order;
    order = order === 5 ? 1 : order + 1;
  }
  return map;
}

/**
 * Build the effective date → day-order map with declared holidays
 * auto-shifted: removing a working day pushes its day order (and all
 * subsequent ones) onto the next working days.
 */
export function buildEffectiveMap(
  declared: DeclaredHoliday[],
  window: SemesterWindow = semesterWindow()
): Record<string, number> {
  const canonical = generateDayOrderMap(window);
  if (declared.length === 0) return canonical;
  const declaredSet = new Set(declared.map((h) => h.date));
  const dates = Object.keys(canonical);
  const orders = dates.map((d) => canonical[d]);
  const workingDates = dates.filter((d) => !declaredSet.has(d));
  const map: Record<string, number> = {};
  workingDates.forEach((date, i) => {
    map[date] = orders[i];
  });
  return map;
}

export function getDayInfo(
  date: string,
  declared: DeclaredHoliday[] = [],
  window: SemesterWindow = semesterWindow()
): DayInfo {
  if (date < window.start) return { date, kind: "pre-semester", dayOrder: null };
  if (date > window.end) return { date, kind: "post-semester", dayOrder: null };
  if (isWeekend(date)) return { date, kind: "weekend", dayOrder: null };
  const official = OFFICIAL_HOLIDAYS[date];
  if (official)
    return { date, kind: "official-holiday", dayOrder: null, holidayName: official };
  const declaredHit = declared.find((h) => h.date === date);
  if (declaredHit)
    return {
      date,
      kind: "declared-holiday",
      dayOrder: null,
      holidayName: declaredHit.name || "Declared holiday",
    };
  const effective = buildEffectiveMap(declared, window);
  const order = effective[date];
  if (order === undefined) return { date, kind: "no-class", dayOrder: null };
  return { date, kind: "working", dayOrder: order };
}

export function daysUntilSemesterStart(
  date: string = todayISO(),
  window: SemesterWindow = semesterWindow()
): number {
  return diffDays(date, window.start);
}

/** Next date (strictly after `date`) that has a day order. */
export function nextWorkingDate(
  date: string,
  declared: DeclaredHoliday[] = [],
  window: SemesterWindow = semesterWindow()
): DayInfo | null {
  const effective = buildEffectiveMap(declared, window);
  const next = Object.keys(effective)
    .sort()
    .find((d) => d > date);
  return next ? { date: next, kind: "working", dayOrder: effective[next] } : null;
}

/** All working dates (with day orders) up to and including `date`. */
export function workingDatesThrough(
  date: string,
  declared: DeclaredHoliday[] = [],
  window: SemesterWindow = semesterWindow()
): Array<{ date: string; dayOrder: number }> {
  const effective = buildEffectiveMap(declared, window);
  return Object.keys(effective)
    .sort()
    .filter((d) => d <= date)
    .map((d) => ({ date: d, dayOrder: effective[d] }));
}

export { SEMESTER_START, SEMESTER_END, OFFICIAL_HOLIDAYS };
