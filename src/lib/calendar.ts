import {
  DAY_ORDER_MAP,
  OFFICIAL_HOLIDAYS,
  SEMESTER_START,
  SEMESTER_END,
} from "@/data/semester";
import type { DeclaredHoliday } from "@/types";
import { isWeekend, diffDays, todayISO } from "@/lib/dates";

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

const CANONICAL_DATES = Object.keys(DAY_ORDER_MAP).sort();

/**
 * Build the effective date → day-order map with declared holidays
 * auto-shifted: removing a working day pushes its day order (and all
 * subsequent ones) onto the next working days.
 */
export function buildEffectiveMap(declared: DeclaredHoliday[]): Record<string, number> {
  if (declared.length === 0) return DAY_ORDER_MAP;
  const declaredSet = new Set(declared.map((h) => h.date));
  const orders = CANONICAL_DATES.map((d) => DAY_ORDER_MAP[d]);
  const workingDates = CANONICAL_DATES.filter((d) => !declaredSet.has(d));
  const map: Record<string, number> = {};
  workingDates.forEach((date, i) => {
    map[date] = orders[i];
  });
  return map;
}

export function getDayInfo(date: string, declared: DeclaredHoliday[] = []): DayInfo {
  if (date < SEMESTER_START) return { date, kind: "pre-semester", dayOrder: null };
  if (date > SEMESTER_END) return { date, kind: "post-semester", dayOrder: null };
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
  const effective = buildEffectiveMap(declared);
  const order = effective[date];
  if (order === undefined) return { date, kind: "no-class", dayOrder: null };
  return { date, kind: "working", dayOrder: order };
}

export function daysUntilSemesterStart(date: string = todayISO()): number {
  return diffDays(date, SEMESTER_START);
}

/** Next date (strictly after `date`) that has a day order. */
export function nextWorkingDate(
  date: string,
  declared: DeclaredHoliday[] = []
): DayInfo | null {
  const effective = buildEffectiveMap(declared);
  const next = Object.keys(effective)
    .sort()
    .find((d) => d > date);
  return next ? { date: next, kind: "working", dayOrder: effective[next] } : null;
}

/** All working dates (with day orders) up to and including `date`. */
export function workingDatesThrough(
  date: string,
  declared: DeclaredHoliday[] = []
): Array<{ date: string; dayOrder: number }> {
  const effective = buildEffectiveMap(declared);
  return Object.keys(effective)
    .sort()
    .filter((d) => d <= date)
    .map((d) => ({ date: d, dayOrder: effective[d] }));
}

export { SEMESTER_START, SEMESTER_END, OFFICIAL_HOLIDAYS };
