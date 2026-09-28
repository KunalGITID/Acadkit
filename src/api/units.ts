import { supabase } from "@/lib/supabase";
import type { Tick, UnitsData } from "@/lib/units";

/** Syllabus units from the sync, or null before it has sent any. */
export async function fetchUnits(pin: string): Promise<UnitsData | null> {
  const { data, error } = await supabase.storage.from("study-files").download(`${pin}/units.json`);
  if (error) {
    if (/not.?found|does not exist/i.test(error.message)) return null;
    throw error;
  }
  return JSON.parse(await data.text()) as UnitsData;
}

/** Topics ticked as studied (migration 034). */
export async function fetchTicks(pin: string): Promise<Tick[]> {
  const { data, error } = await supabase.from("syllabus_progress").select("course_code, unit, topic").eq("device_id", pin);
  if (error) throw error;
  return (data ?? []) as Tick[];
}

export async function setTick(pin: string, t: Tick, done: boolean): Promise<void> {
  if (done) {
    const { error } = await supabase
      .from("syllabus_progress")
      .upsert({ device_id: pin, ...t }, { onConflict: "device_id,course_code,unit,topic", ignoreDuplicates: true });
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("syllabus_progress")
      .delete()
      .eq("device_id", pin)
      .eq("course_code", t.course_code)
      .eq("unit", t.unit)
      .eq("topic", t.topic);
    if (error) throw error;
  }
}
