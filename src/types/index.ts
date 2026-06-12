export type SubjectType = "theory" | "lab";

export interface Subject {
  id: string;
  device_id: string;
  code: string;
  name: string;
  credits: number;
  type: SubjectType;
  faculty: string | null;
  color_hex: string;
  /** No end-sem exam — internals make the full /100 (migration 008). */
  internal_only?: boolean | null;
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
 */
export type AttendanceStatus = "present" | "absent" | "holiday";

export interface AttendanceRecord {
  id: string;
  device_id: string;
  subject_id: string;
  date: string; // "YYYY-MM-DD"
  start_time: string;
  end_time: string;
  status: AttendanceStatus;
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
  added_at?: string;
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
  created_at?: string;
}

export interface DeclaredHoliday {
  date: string; // "YYYY-MM-DD"
  name: string;
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
}
