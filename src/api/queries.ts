import { supabase } from "@/lib/supabase";
import { SEED_SUBJECTS, SEMESTER_START, SEMESTER_END } from "@/data/semester";
import type {
  AttendanceRecord,
  Deadline,
  DeclaredHoliday,
  Mark,
  Settings,
  Subject,
  TimetableSlot,
} from "@/types";

function throwIf(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

// ---------- settings / account ----------

export async function fetchSettings(pin: string): Promise<Settings | null> {
  const { data, error } = await supabase
    .from("settings")
    .select("*")
    .eq("device_id", pin)
    .maybeSingle();
  throwIf(error);
  return (data as Settings | null) ?? null;
}

export async function updateSettings(pin: string, patch: Partial<Settings>): Promise<void> {
  const { error } = await supabase.from("settings").update(patch).eq("device_id", pin);
  throwIf(error);
}

export async function setDeclaredHolidays(pin: string, holidays: DeclaredHoliday[]) {
  await updateSettings(pin, { declared_holidays: holidays });
}

/** Does any data exist under this PIN? (settings row or subjects) */
export async function accountExists(pin: string): Promise<boolean> {
  const settings = await fetchSettings(pin);
  if (settings) return true;
  const { count, error } = await supabase
    .from("subjects")
    .select("id", { count: "exact", head: true })
    .eq("device_id", pin);
  throwIf(error);
  return (count ?? 0) > 0;
}

/** First-time setup for a fresh PIN: settings row + starter subjects. */
export async function seedAccount(pin: string): Promise<void> {
  const { error: sErr } = await supabase.from("settings").upsert(
    {
      device_id: pin,
      semester: 3,
      sem_start: SEMESTER_START,
      sem_end: SEMESTER_END,
      declared_holidays: [],
    },
    { onConflict: "device_id" }
  );
  throwIf(sErr);
  const { error: subErr } = await supabase
    .from("subjects")
    .insert(SEED_SUBJECTS.map((s) => ({ ...s, device_id: pin })));
  throwIf(subErr);
}

/** Ensure a settings row exists (e.g. syncing into a PIN that has subjects only). */
export async function ensureSettings(pin: string): Promise<void> {
  const { error } = await supabase
    .from("settings")
    .upsert({ device_id: pin }, { onConflict: "device_id", ignoreDuplicates: true });
  throwIf(error);
}

// ---------- subjects ----------

export async function fetchSubjects(pin: string): Promise<Subject[]> {
  const { data, error } = await supabase
    .from("subjects")
    .select("*")
    .eq("device_id", pin)
    .order("credits", { ascending: false })
    .order("code");
  throwIf(error);
  return (data as Subject[]) ?? [];
}

export async function insertSubject(
  pin: string,
  subject: Omit<Subject, "id" | "device_id" | "created_at">
): Promise<void> {
  const { error } = await supabase.from("subjects").insert({ ...subject, device_id: pin });
  throwIf(error);
}

export async function updateSubject(id: string, patch: Partial<Subject>): Promise<void> {
  const { error } = await supabase.from("subjects").update(patch).eq("id", id);
  throwIf(error);
}

export async function deleteSubject(id: string): Promise<void> {
  const { error } = await supabase.from("subjects").delete().eq("id", id);
  throwIf(error);
}

// ---------- timetable ----------

export async function fetchTimetable(pin: string): Promise<TimetableSlot[]> {
  const { data, error } = await supabase
    .from("timetable_slots")
    .select("*")
    .eq("device_id", pin)
    .order("day_order")
    .order("start_time");
  throwIf(error);
  return (data as TimetableSlot[]) ?? [];
}

export async function insertSlot(
  pin: string,
  slot: Omit<TimetableSlot, "id" | "device_id" | "created_at">
): Promise<void> {
  const { error } = await supabase
    .from("timetable_slots")
    .insert({ ...slot, device_id: pin });
  throwIf(error);
}

export async function updateSlot(id: string, patch: Partial<TimetableSlot>): Promise<void> {
  const { error } = await supabase.from("timetable_slots").update(patch).eq("id", id);
  throwIf(error);
}

export async function deleteSlot(id: string): Promise<void> {
  const { error } = await supabase.from("timetable_slots").delete().eq("id", id);
  throwIf(error);
}

export async function clearTimetable(pin: string): Promise<void> {
  const { error } = await supabase.from("timetable_slots").delete().eq("device_id", pin);
  throwIf(error);
}

// ---------- attendance ----------

export async function fetchAttendance(pin: string): Promise<AttendanceRecord[]> {
  const { data, error } = await supabase
    .from("attendance")
    .select("*")
    .eq("device_id", pin)
    .order("date", { ascending: false });
  throwIf(error);
  return (data as AttendanceRecord[]) ?? [];
}

export async function upsertAttendance(
  pin: string,
  record: Omit<AttendanceRecord, "id" | "device_id">
): Promise<void> {
  const { error } = await supabase
    .from("attendance")
    .upsert(
      { ...record, device_id: pin },
      { onConflict: "device_id,subject_id,date,start_time" }
    );
  throwIf(error);
}

export async function deleteAttendance(
  pin: string,
  key: { subject_id: string; date: string; start_time: string }
): Promise<void> {
  const { error } = await supabase
    .from("attendance")
    .delete()
    .eq("device_id", pin)
    .eq("subject_id", key.subject_id)
    .eq("date", key.date)
    .eq("start_time", key.start_time);
  throwIf(error);
}

// ---------- marks ----------

export async function fetchMarks(pin: string): Promise<Mark[]> {
  const { data, error } = await supabase
    .from("marks")
    .select("*")
    .eq("device_id", pin)
    .order("added_at");
  throwIf(error);
  return (data as Mark[]) ?? [];
}

export async function insertMark(
  pin: string,
  mark: Omit<Mark, "id" | "device_id" | "added_at">
): Promise<void> {
  const { error } = await supabase.from("marks").insert({ ...mark, device_id: pin });
  throwIf(error);
}

export async function updateMark(id: string, patch: Partial<Mark>): Promise<void> {
  const { error } = await supabase.from("marks").update(patch).eq("id", id);
  throwIf(error);
}

export async function deleteMark(id: string): Promise<void> {
  const { error } = await supabase.from("marks").delete().eq("id", id);
  throwIf(error);
}

// ---------- deadlines ----------

export async function fetchDeadlines(pin: string): Promise<Deadline[]> {
  const { data, error } = await supabase
    .from("deadlines")
    .select("*")
    .eq("device_id", pin)
    .order("due_date");
  throwIf(error);
  return (data as Deadline[]) ?? [];
}

export async function insertDeadline(
  pin: string,
  deadline: Omit<Deadline, "id" | "device_id" | "created_at">
): Promise<void> {
  const { error } = await supabase.from("deadlines").insert({ ...deadline, device_id: pin });
  throwIf(error);
}

export async function updateDeadline(id: string, patch: Partial<Deadline>): Promise<void> {
  const { error } = await supabase.from("deadlines").update(patch).eq("id", id);
  throwIf(error);
}

export async function deleteDeadline(id: string): Promise<void> {
  const { error } = await supabase.from("deadlines").delete().eq("id", id);
  throwIf(error);
}

// ---------- data management ----------

export async function deleteAllData(pin: string): Promise<void> {
  // subjects cascade to timetable_slots, attendance, marks
  for (const table of ["deadlines", "subjects", "timetable_slots", "attendance", "marks", "settings"]) {
    const { error } = await supabase.from(table).delete().eq("device_id", pin);
    throwIf(error);
  }
}

export async function exportAllData(pin: string) {
  const [settings, subjects, timetable, attendance, marks, deadlines] = await Promise.all([
    fetchSettings(pin),
    fetchSubjects(pin),
    fetchTimetable(pin),
    fetchAttendance(pin),
    fetchMarks(pin),
    fetchDeadlines(pin),
  ]);
  return {
    exported_at: new Date().toISOString(),
    pin,
    settings,
    subjects,
    timetable,
    attendance,
    marks,
    deadlines,
  };
}
