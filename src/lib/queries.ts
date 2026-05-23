import { normalizeTime } from "@/lib/constants";
import { supabase } from "@/lib/supabase";
import type {
  Attendance,
  Deadline,
  Mark,
  Settings,
  Subject,
  TimetableSlot,
} from "@/types/database";

function mapTimetableSlot(row: TimetableSlot): TimetableSlot {
  return {
    ...row,
    start_time: normalizeTime(row.start_time),
    end_time: normalizeTime(row.end_time),
  };
}

export async function getSubjectsForDevice(
  deviceId: string
): Promise<Subject[]> {
  const { data, error } = await supabase
    .from("subjects")
    .select("*")
    .eq("device_id", deviceId)
    .order("name");

  if (error) {
    console.error("getSubjectsForDevice:", error.message);
    return [];
  }
  return data ?? [];
}

export async function getAttendanceForDevice(
  deviceId: string
): Promise<Attendance[]> {
  const { data, error } = await supabase
    .from("attendance")
    .select("*")
    .eq("device_id", deviceId)
    .order("date", { ascending: false });

  if (error) {
    console.error("getAttendanceForDevice:", error.message);
    return [];
  }
  return (data ?? []).map((row) => ({
    ...row,
    start_time: normalizeTime(row.start_time ?? "08:00"),
    end_time: normalizeTime(row.end_time ?? "08:50"),
  }));
}

export async function getMarksForDevice(deviceId: string): Promise<Mark[]> {
  const { data, error } = await supabase
    .from("marks")
    .select("*")
    .eq("device_id", deviceId)
    .order("added_at", { ascending: true });

  if (error) {
    console.error("getMarksForDevice:", error.message);
    return [];
  }
  return (data ?? []).map((row) => ({
    ...row,
    marks_obtained: Number(row.marks_obtained),
    max_marks: Number(row.max_marks),
    is_external: Boolean(row.is_external),
  }));
}

export async function getDeadlinesForDevice(
  deviceId: string
): Promise<Deadline[]> {
  const { data, error } = await supabase
    .from("deadlines")
    .select("*")
    .eq("device_id", deviceId)
    .order("due_date", { ascending: true });

  if (error) {
    console.error("getDeadlinesForDevice:", error.message);
    return [];
  }
  return data ?? [];
}

export async function getTimetableForDevice(
  deviceId: string
): Promise<TimetableSlot[]> {
  const { data, error } = await supabase
    .from("timetable_slots")
    .select("*")
    .eq("device_id", deviceId)
    .order("day_order")
    .order("start_time");

  if (error) {
    console.error("getTimetableForDevice:", error.message);
    return [];
  }
  return (data ?? []).map(mapTimetableSlot);
}

export async function getSettingsForDevice(
  deviceId: string
): Promise<Settings | null> {
  const { data, error } = await supabase
    .from("settings")
    .select("*")
    .eq("device_id", deviceId)
    .maybeSingle();

  if (error) {
    console.error("getSettingsForDevice:", error.message);
    return null;
  }
  if (!data) return null;
  return {
    ...data,
    declared_holidays: data.declared_holidays ?? [],
    current_day_order: data.current_day_order ?? 1,
  };
}
