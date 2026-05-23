export interface Subject {
  id: string;
  device_id: string;
  code: string;
  name: string;
  credits: number;
  type: "theory" | "lab";
  faculty?: string;
  color_hex: string;
  created_at: string;
}

export interface TimetableSlot {
  id: string;
  device_id: string;
  subject_id: string;
  day_order: number;
  start_time: string;
  end_time: string;
  room?: string;
  slot_type: "theory" | "lab";
  created_at: string;
}

export interface TimetableSlotWithSubject extends TimetableSlot {
  subject: Subject;
}

export interface Attendance {
  id: string;
  device_id: string;
  subject_id: string;
  date: string;
  start_time: string;
  end_time: string;
  status: "present" | "absent" | "holiday";
}

export type MarkComponentType =
  | "CT"
  | "Lab"
  | "Assignment"
  | "Project"
  | "External";

export interface Mark {
  id: string;
  device_id: string;
  subject_id: string;
  component_type: MarkComponentType;
  label: string;
  marks_obtained: number;
  max_marks: number;
  is_external: boolean;
  added_at: string;
}

export interface Deadline {
  id: string;
  device_id: string;
  subject_id?: string;
  title: string;
  type: "exam" | "assignment" | "lab" | "other";
  due_date: string;
  status: "pending" | "done";
  priority: "low" | "medium" | "high";
  created_at: string;
}

export interface Settings {
  id: string;
  device_id: string;
  semester: number;
  target_sgpa: number;
  min_attendance: number;
  grading_scale: Record<string, { min: number; max: number; points: number }>;
  sem_start?: string;
  sem_end?: string;
  declared_holidays: string[];
  current_day_order: number;
}
