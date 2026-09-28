import { diffDays, todayISO } from "@/lib/dates";
import type { Deadline } from "@/types";

/** The next exam, if it is close enough to be worth shouting about. */

export const HORIZON_DAYS = 21;

export interface ExamCountdown {
  deadline: Deadline;
  /** 0 = today, 1 = tomorrow. Never negative. */
  daysAway: number;
}

export function nextExam(
  deadlines: Deadline[] | undefined,
  today: string = todayISO(),
  horizon: number = HORIZON_DAYS
): ExamCountdown | null {
  const candidates = (deadlines ?? [])
    .filter((d) => d.status === "pending" && d.type === "exam")
    .map((d) => ({ deadline: d, daysAway: diffDays(today, d.due_date.slice(0, 10)) }))
    // An exam that has already happened is history, not a countdown. Today
    // still counts - you may well be sitting it in an hour.
    .filter((c) => c.daysAway >= 0 && c.daysAway <= horizon)
    .sort((a, b) => a.daysAway - b.daysAway);

  return candidates[0] ?? null;
}

/** "today", "tomorrow", "6 days" - the headline of the countdown. */
export function countdownLabel(daysAway: number): string {
  if (daysAway <= 0) return "today";
  if (daysAway === 1) return "tomorrow";
  return `${daysAway} days`;
}

/** How alarming the card should look. */
export type ExamUrgency = "far" | "near" | "imminent";

export function examUrgency(daysAway: number): ExamUrgency {
  if (daysAway <= 1) return "imminent";
  if (daysAway <= 6) return "near";
  return "far";
}
