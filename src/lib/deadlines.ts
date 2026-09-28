import { isExternalLabel } from "@/lib/plan";
import type { Deadline, DeadlineType, Subject } from "@/types";

/** Deadlines are named by what they are, not by a typed-in title. */

export const DEADLINE_TYPE_LABEL: Record<DeadlineType, string> = {
  assignment: "Assignment",
  exam: "Exam",
  lab: "Lab",
  other: "Other",
};

/** What a deadline row leads with: its subject, or its type if unassigned. */
export function deadlineLabel(
  deadline: Pick<Deadline, "type">,
  subject?: Pick<Subject, "name" | "short_name"> | null
): string {
  if (!subject?.name?.trim()) return DEADLINE_TYPE_LABEL[deadline.type];
  // A short name the user typed still wins - that field exists to be honoured, and this is the last place that reads it.
  return subject.short_name?.trim() || subject.name.trim();
}

/**
 * The value written to `title`. Uses the subject code rather than its
 * name so the stored string stays short and stable if a subject is
 * later renamed.
 */
export function derivedTitle(
  type: DeadlineType,
  subject?: Pick<Subject, "code"> | null
): string {
  const label = DEADLINE_TYPE_LABEL[type];
  const code = subject?.code?.trim();
  return code ? `${code} ${label}` : label;
}

/** The deadlines still ahead of you, soonest first. */
export function upcomingDeadlines(deadlines: Deadline[] | undefined, now: number, limit = 5): Deadline[] {
  return (deadlines ?? [])
    .filter((d) => d.status === "pending" && new Date(d.due_date).getTime() > now)
    .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
    .slice(0, limit);
}

/** An end-sem paper, not a deadline. */
export function isEndSemDeadline(d: Pick<Deadline, "title" | "type" | "due_date">, semEnd?: string | null): boolean {
  if (isExternalLabel(d.title)) return true;
  if (d.type !== "exam" || !semEnd || !d.due_date) return false;
  return new Date(d.due_date).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) > semEnd;
}
