import type { Mark, MarkComponentType, Subject, TimetableSlot } from "@/types";

/** SRM's names for the internal components. */

/** True when this subject runs labs as well as theory. */
export function isLabIntegrated(
  subject: Pick<Subject, "id" | "code">,
  timetable: TimetableSlot[]
): boolean {
  const slots = timetable.filter((s) => s.subject_id === subject.id);
  if (slots.some((s) => s.slot_type === "lab")) return true;
  if (slots.length > 0) return false;
  // No slots entered yet - fall back to the letter SRM puts in the code.
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

/** The next label for a component of this type. */
export function nextComponentLabel(
  type: MarkComponentType,
  labIntegrated: boolean,
  existing: Mark[]
): string {
  const prefix = labelPrefix(type, labIntegrated);
  const count = existing.filter((m) => !m.is_external && m.component_type === type).length;
  return `${prefix}-${count + 1}`;
}

/** A label reduced to the thing it names, ignoring dialect. */
const ROMAN: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10 };

export function labelMatchKey(label: string): string {
  // Faculty write components in Roman numerals as often as not - "FJ-II", "PBL-I" - and a deadline titled that way must land on the plan's "FJ-2" rather than be adopted as a second component.
  let text = label.trim().toLowerCase();
  const roman = /^([a-z]+)[\s_-]+([ivx]+)$/.exec(text);
  if (roman && ROMAN[roman[2]]) text = `${roman[1]}${ROMAN[roman[2]]}`;
  const flat = text.replace(/[\s_-]+/g, "");
  const family = /^(?:ct|ft|fj)(\d+)$/.exec(flat);
  if (family) return `f${family[1]}`;
  const learning = /^(?:lab|llt|llj)(\d+)$/.exec(flat);
  if (learning) return `ll${learning[1]}`;
  return flat;
}

