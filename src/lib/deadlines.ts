import { fitName } from "@/lib/subjectName";
import type { Deadline, DeadlineType, Subject } from "@/types";

/**
 * Deadlines are named by what they are, not by a typed-in title.
 *
 * A row already carries the subject and the type, and showed both next
 * to a free-text title that usually just restated them ("DSA Lab Record"
 * above "21CSC201J · LAB"). The title field is gone; these derive the
 * same label from the data.
 *
 * The `title` column stays in the schema — it's NOT NULL, it's in the
 * JSON export, and older rows still carry real titles — so writes fill
 * it with the derived string rather than dropping it.
 */

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
  // These rows sit beside a date and a badge, so a seventy-character
  // portal name would be an ellipsis either way.
  return fitName(subject);
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
