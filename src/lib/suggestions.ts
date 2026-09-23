import { derivedTitle } from "@/lib/deadlines";
import type { Deadline, DeadlineType, Subject } from "@/types";

/**
 * Deadlines the weekly scan found in the study folder, offered rather
 * than applied (migration 026). This decides which of them are still
 * worth showing and what accepting one writes.
 */

export type SuggestionStatus = "pending" | "accepted" | "dismissed";

export interface DeadlineSuggestionPayload {
  /** Course code as the files write it, e.g. "21CSC201J". Null if the note named no subject. */
  subject_code: string | null;
  type: DeadlineType;
  /** The component, when the source names one ("FJ-2", "LLJ-1"). Becomes the title. */
  label?: string | null;
  /** ISO timestamp with offset, e.g. "2026-10-14T09:30:00+05:30". */
  due_date: string;
  max_marks?: number | null;
}

export interface Suggestion {
  id: string;
  device_id: string;
  key: string;
  kind: "deadline";
  payload: DeadlineSuggestionPayload;
  source: string | null;
  evidence: string | null;
  status: SuggestionStatus;
  created_at?: string;
}

export interface DeadlineOffer {
  suggestion: Suggestion;
  subject: Subject | null;
  /** Exactly what Add writes — the same shape the deadline sheet saves. */
  deadline: Omit<Deadline, "id" | "device_id" | "created_at">;
}

const localDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA");
const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * The suggestions to put in front of you, soonest first.
 *
 * Hidden: anything decided, anything already past, and anything you
 * already have — a deadline for the same subject on the same day that
 * is the same thing (same component label if the suggestion names one,
 * otherwise the same type). Matching by day rather than by minute is
 * deliberate: the note says "Friday", you typed 9:30, and those are one
 * test. A code that matches no subject still shows, unassigned, rather
 * than being dropped: a real date with a missing subject is still a
 * real date.
 */
export function deadlineOffers(
  suggestions: Suggestion[] | undefined,
  deadlines: Deadline[] | undefined,
  subjects: Subject[] | undefined,
  now: number
): DeadlineOffer[] {
  const byCode = new Map((subjects ?? []).map((s) => [norm(s.code), s]));
  return (suggestions ?? [])
    .filter((s) => s.kind === "deadline" && s.status === "pending")
    .filter((s) => !Number.isNaN(new Date(s.payload.due_date).getTime()))
    .filter((s) => new Date(s.payload.due_date).getTime() > now)
    .map((s) => {
      const p = s.payload;
      const subject = p.subject_code ? (byCode.get(norm(p.subject_code)) ?? null) : null;
      const label = p.label?.trim() || null;
      return {
        suggestion: s,
        subject,
        deadline: {
          title: label ?? derivedTitle(p.type, subject),
          subject_id: subject?.id ?? null,
          type: p.type,
          priority: p.type === "exam" ? ("high" as const) : ("medium" as const),
          due_date: new Date(p.due_date).toISOString(),
          status: "pending" as const,
          max_marks: p.max_marks ?? null,
        },
      };
    })
    .filter((o) => !alreadyHave(o, deadlines ?? []))
    .sort((a, b) => a.deadline.due_date.localeCompare(b.deadline.due_date));
}

function alreadyHave(o: DeadlineOffer, deadlines: Deadline[]): boolean {
  const day = localDay(o.deadline.due_date);
  const label = norm(o.suggestion.payload.label);
  return deadlines.some(
    (d) =>
      d.subject_id === o.deadline.subject_id &&
      localDay(d.due_date) === day &&
      (label ? norm(d.title).includes(label) : d.type === o.deadline.type)
  );
}
