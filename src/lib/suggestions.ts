import { labelMatchKey } from "@/lib/componentLabel";
import { derivedTitle } from "@/lib/deadlines";
import type { Assessment, Deadline, DeadlineType, MarkComponentType, Subject } from "@/types";

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

/** A subject's marks plan as its course assessment plan states it. */
export interface PlanSuggestionPayload {
  subject_code: string;
  /** Internal share of the /100 (60 for most, 100 for a fully internal course). */
  internal: number;
  components: { label: string; type: MarkComponentType; max: number }[];
}

export type Suggestion =
  | (SuggestionBase & { kind: "deadline"; payload: DeadlineSuggestionPayload })
  | (SuggestionBase & { kind: "plan"; payload: PlanSuggestionPayload });

interface SuggestionBase {
  id: string;
  device_id: string;
  key: string;
  source: string | null;
  evidence: string | null;
  status: SuggestionStatus;
  created_at?: string;
}

export type DeadlineSuggestion = Extract<Suggestion, { kind: "deadline" }>;
export type PlanSuggestion = Extract<Suggestion, { kind: "plan" }>;

export interface DeadlineOffer {
  suggestion: DeadlineSuggestion;
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
    .filter((s): s is DeadlineSuggestion => s.kind === "deadline" && s.status === "pending")
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
  const label = o.suggestion.payload.label?.trim();
  // The same matcher the budget uses, so "FJ-II" here is "FJ-2" there.
  const key = label ? labelMatchKey(label) : null;
  return deadlines.some(
    (d) =>
      d.subject_id === o.deadline.subject_id &&
      localDay(d.due_date) === day &&
      (key ? labelMatchKey(d.title) === key : d.type === o.deadline.type)
  );
}

export interface PlanOffer {
  suggestion: PlanSuggestion;
  subject: Subject;
  /** What Apply writes to subjects.assessment. */
  assessment: Assessment;
  /** True when the subject has no components yet, so nothing is replaced. */
  fresh: boolean;
}

/**
 * Marks plans worth offering: for a subject you have, and different
 * from the plan it already carries. "Different" is compared the way the
 * budget reads a plan — same internal share and the same components by
 * match key and weight — so a plan you typed as "FJ-2" is not offered
 * again as "FJ-II". Applying keeps your component keys where a label
 * matches (marks stay attached to their row) and your end-sem
 * expectation, and replaces the rest.
 */
export function planOffers(suggestions: Suggestion[] | undefined, subjects: Subject[] | undefined): PlanOffer[] {
  const byCode = new Map((subjects ?? []).map((s) => [norm(s.code), s]));
  const out: PlanOffer[] = [];
  for (const s of suggestions ?? []) {
    if (s.kind !== "plan" || s.status !== "pending") continue;
    const subject = byCode.get(norm(s.payload.subject_code));
    const comps = s.payload.components.filter((c) => c.label?.trim() && c.max > 0);
    if (!subject || comps.length === 0 || !(s.payload.internal > 0 && s.payload.internal <= 100)) continue;
    const current = subject.assessment;
    const same =
      current &&
      current.internal === s.payload.internal &&
      current.components.length === comps.length &&
      comps.every((c) => current.components.some((k) => labelMatchKey(k.label) === labelMatchKey(c.label) && k.max === c.max));
    if (same) continue;
    const keep = new Map((current?.components ?? []).map((k) => [labelMatchKey(k.label), k.key]));
    let n = 0;
    out.push({
      suggestion: s,
      subject,
      fresh: !current?.components.length,
      assessment: {
        internal: s.payload.internal,
        complete: comps.reduce((sum, c) => sum + c.max, 0) === s.payload.internal,
        assumedExternalPct: current?.assumedExternalPct ?? null,
        components: comps.map((c) => ({
          key: keep.get(labelMatchKey(c.label)) ?? `s${s.key.slice(0, 8)}${n++}`,
          label: c.label.trim(),
          type: c.type,
          max: c.max,
        })),
      },
    });
  }
  return out;
}
