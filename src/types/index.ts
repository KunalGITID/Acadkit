export type SubjectType = "theory" | "lab";

/**
 * Declared here rather than in lib/grades.ts because `Subject` needs it
 * and types/ is the leaf: the other direction would be a cycle.
 * `lib/grades.ts` re-exports it, so every existing import still works.
 */
export type Grade = "O" | "A+" | "A" | "B+" | "B" | "C" | "F";

/** One declared internal component, in marks out of the internal weight. */
export interface PlannedComponent {
  /** Stable across edits so React keys and mark-matching survive renames. */
  key: string;
  label: string;
  type: MarkComponentType;
  max: number;
}

/**
 * How a subject's /100 is built: the internal share, and the components
 * that make it up. Partial by default — SRM faculty announce tests at
 * their own pace, so undeclared internal weight stays an open bucket
 * rather than being assumed away. See src/lib/plan.ts.
 */
export interface Assessment {
  /** Internal share of the /100; the end-sem is the remainder. */
  internal: number;
  /** True when `components` is the whole internal breakdown. */
  complete: boolean;
  components: PlannedComponent[];
}

export interface Subject {
  id: string;
  device_id: string;
  code: string;
  name: string;
  credits: number;
  type: SubjectType;
  faculty: string | null;
  color_hex: string;
  /** Overrides the derived abbreviation in tight lists (migration 016). */
  short_name?: string | null;
  /** No end-sem exam — internals make the full /100 (migration 008). */
  internal_only?: boolean | null;
  /**
   * Internal/external split and the component breakdown (migration 021).
   * Null on subjects predating it — `assessmentFor` falls back to
   * `internal_only` and the 60/40 default.
   */
  assessment?: Assessment | null;
  /**
   * What you're actually aiming for here, which is not always what the
   * target SGPA implies — a subject you're weak in gets its own number
   * (migration 021). Null = derive it from settings.target_sgpa.
   */
  target_grade?: Grade | null;
  created_at?: string;
}

export interface TimetableSlot {
  id: string;
  device_id: string;
  subject_id: string;
  day_order: number;
  start_time: string; // "HH:MM:SS"
  end_time: string;
  room: string | null;
  /** Theory vs lab session of the subject (migration 008). */
  slot_type?: SubjectType | null;
  created_at?: string;
}

/**
 * "holiday" is the DB value for a cancelled / no-class slot
 * (constraint predates the rebuild; UI presents it as "Cancelled").
 * "od" is On Duty — the department pulled you out of class and the
 * portal counts the hour as attended (migration 020).
 *
 * Nothing should test these values directly to decide whether a row
 * counts: use isCounted / isAttended in src/lib/attendance.ts, which is
 * the single place that knows what each one means.
 */
export type AttendanceStatus = "present" | "absent" | "holiday" | "od";

export interface AttendanceRecord {
  id: string;
  device_id: string;
  subject_id: string;
  date: string; // "YYYY-MM-DD"
  start_time: string;
  end_time: string;
  status: AttendanceStatus;
  /** Written by auto-marking, not the user (migration 013). */
  auto_marked?: boolean | null;
}

export type MarkComponentType = "CT" | "Lab" | "Assignment" | "Project" | "External";

export interface Mark {
  id: string;
  device_id: string;
  subject_id: string;
  component_type: MarkComponentType;
  label: string;
  marks_obtained: number;
  max_marks: number;
  is_external: boolean;
  /** "portal" rows are owned by the bookmarklet sync (migration 012). */
  source?: MarkSource | null;
  added_at?: string;
}

export type MarkSource = "manual" | "portal";

/**
 * One subject's attendance as the portal last reported it. The portal
 * only exposes totals, so this is the baseline that per-class records
 * after `as_of` are layered onto.
 */
export interface PortalSnapshot {
  id: string;
  device_id: string;
  subject_code: string;
  conducted: number;
  absent: number;
  /** Percentage as printed by the portal, for cross-checking the parse. */
  percentage: number | null;
  as_of: string; // "YYYY-MM-DD"
  synced_at?: string;
}

export type DeadlineType = "exam" | "assignment" | "lab" | "other";
export type DeadlineStatus = "pending" | "done";
export type DeadlinePriority = "low" | "medium" | "high";

export interface Deadline {
  id: string;
  device_id: string;
  subject_id: string | null;
  title: string;
  type: DeadlineType;
  due_date: string; // ISO timestamp
  status: DeadlineStatus;
  priority: DeadlinePriority;
  /** What the test is out of, when it carries marks (migration 017). */
  max_marks?: number | null;
  created_at?: string;
}

export interface DeclaredHoliday {
  date: string; // "YYYY-MM-DD"
  name: string;
}

export interface SubjectArchiveRow {
  code: string;
  name: string;
  credits: number;
  grade: string;
  points: number;
  total: number; // /100 at archive time
  attendancePct: number | null;
  color_hex: string;
}

export interface SemesterArchive {
  id: string;
  device_id: string;
  label: string;
  sgpa: number | null;
  credits: number | null;
  summary: SubjectArchiveRow[];
  sem_start: string | null;
  sem_end: string | null;
  archived_at?: string;
}

export interface Settings {
  id: string;
  device_id: string;
  /** Display name for greetings; column added by migration 007 (optional). */
  name?: string | null;
  semester: number;
  target_sgpa: number;
  min_attendance: number;
  sem_start: string | null;
  sem_end: string | null;
  declared_holidays: DeclaredHoliday[];
  current_day_order: number;
  /** Assume past scheduled classes were attended (migration 013). */
  auto_mark_present?: boolean | null;
  /** Theme, synced across devices (migration 018). Null = never chosen. */
  theme?: string | null;
  theme_mode?: string | null;
}
