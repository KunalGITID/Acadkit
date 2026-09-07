import type { Mark, MarkComponentType, Subject, TimetableSlot } from "@/types";

/**
 * SRM's names for the internal components.
 *
 * A course is either theory-only or lab-integrated, and the two use
 * different labels for the same two families of assessment:
 *
 *   theory-only      FT-1, FT-2 …   LLT-1 …
 *   lab-integrated   FJ-1, FJ-2 …   LLJ-1 …
 *
 * Auto-generating "CT-1" meant every plan had to be renamed by hand to
 * match the ones faculty actually announce — and a plan whose labels
 * don't match the deadlines you log is a plan that can't be matched to
 * them either.
 *
 * Which kind a subject is comes from the timetable: a subject with a
 * lab slot is lab-integrated. Failing that, from the course code, where
 * SRM already encodes it — 21CSS202T is theory, 21CSC202J is joint.
 * The timetable wins because it is what you maintain; the code is there
 * for a subject whose slots haven't been entered yet.
 */

/** True when this subject runs labs as well as theory. */
export function isLabIntegrated(
  subject: Pick<Subject, "id" | "code">,
  timetable: TimetableSlot[]
): boolean {
  const slots = timetable.filter((s) => s.subject_id === subject.id);
  if (slots.some((s) => s.slot_type === "lab")) return true;
  if (slots.length > 0) return false;
  // No slots entered yet — fall back to the letter SRM puts in the code.
  return /j$/i.test(subject.code.trim());
}

/** The label family a component type belongs to, in the right dialect. */
export function labelPrefix(type: MarkComponentType, labIntegrated: boolean): string {
  const suffix = labIntegrated ? "J" : "T";
  if (type === "CT") return `F${suffix}`;
  if (type === "Lab") return `LL${suffix}`;
  return type;
}

/** Matches anything this file would have generated, in either dialect. */
export const AUTO_LABEL = /^(FT|FJ|LLT|LLJ|CT|Lab|Assignment|Project)-\d+$/;

/**
 * The next label for a component of this type.
 *
 * Numbered by how many of that *family* already exist rather than how
 * many share the exact prefix, so a subject whose earlier components
 * were entered under the old "CT-1" naming still continues at 2.
 */
export function nextComponentLabel(
  type: MarkComponentType,
  labIntegrated: boolean,
  existing: Mark[]
): string {
  const prefix = labelPrefix(type, labIntegrated);
  const count = existing.filter((m) => !m.is_external && m.component_type === type).length;
  return `${prefix}-${count + 1}`;
}
