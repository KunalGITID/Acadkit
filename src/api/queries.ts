import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { SEED_SUBJECTS, SEMESTER_START, SEMESTER_END } from "@/data/semester";
import type {
  AttendanceRecord,
  Deadline,
  DeclaredHoliday,
  Mark,
  SemesterArchive,
  Settings,
  Subject,
  TimetableSlot,
} from "@/types";

function throwIf(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

/**
 * Columns added by migrations 007/008 (`name`, `slot_type`,
 * `internal_only`). If a migration hasn't been run yet, writes retry
 * without these fields so the core flow keeps working, and we hint
 * once per session.
 */
let migrationHintShown = false;

/** Everything pending, as one paste for the Supabase SQL editor. */
export const PENDING_MIGRATIONS_SQL = `-- AcadKit setup: greeting name, lab tags, internal-only subjects, history
alter table settings add column if not exists name text;
alter table timetable_slots
  add column if not exists slot_type text not null default 'theory'
  check (slot_type in ('theory', 'lab'));
alter table subjects
  add column if not exists internal_only boolean not null default false;

create table if not exists semester_archives (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  label text not null,
  sgpa numeric,
  credits numeric,
  summary jsonb not null default '[]'::jsonb,
  sem_start date,
  sem_end date,
  archived_at timestamptz default now()
);
alter table semester_archives enable row level security;
drop policy if exists "anon_all_semester_archives" on semester_archives;
create policy "anon_all_semester_archives" on semester_archives
  for all to anon using (true) with check (true);`;

const OPTIONAL_COLUMNS: Array<{ table: string; column: string; enables: string }> = [
  { table: "settings", column: "name", enables: "greeting name that follows your PIN" },
  { table: "timetable_slots", column: "slot_type", enables: "theory/lab class tags" },
  { table: "subjects", column: "internal_only", enables: "internal-only subjects" },
  { table: "semester_archives", column: "id", enables: "semester history & CGPA" },
];

/** Which optional features are blocked because their column is missing. */
export async function missingMigrations(): Promise<string[]> {
  const missing: string[] = [];
  await Promise.all(
    OPTIONAL_COLUMNS.map(async ({ table, column, enables }) => {
      const { error } = await supabase.from(table).select(column).limit(1);
      if (error) missing.push(enables);
    })
  );
  return missing;
}

/** https://supabase.com/dashboard/project/<ref>/sql/new for this project. */
export function sqlEditorUrl(): string {
  const ref = new URL(import.meta.env.VITE_SUPABASE_URL as string).hostname.split(".")[0];
  return `https://supabase.com/dashboard/project/${ref}/sql/new`;
}

async function withColumnFallback<T extends Record<string, unknown>>(
  payload: T,
  optionalColumns: string[],
  run: (payload: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }>
): Promise<void> {
  const { error } = await run(payload);
  if (!error) return;
  const missing = optionalColumns.find((col) => error.message.includes(`'${col}'`));
  if (!missing) throw new Error(error.message);
  const stripped = { ...payload };
  delete stripped[missing];
  const retry = await run(stripped);
  throwIf(retry.error);
  if (!migrationHintShown) {
    migrationHintShown = true;
    toast.info("Saved — one field needs a quick setup step", {
      description: "Settings → Finish setup: copy one SQL snippet, paste, done.",
      duration: 8000,
    });
  }
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
  await withColumnFallback({ ...subject, device_id: pin }, ["internal_only"], (payload) =>
    supabase.from("subjects").insert(payload)
  );
}

export async function updateSubject(id: string, patch: Partial<Subject>): Promise<void> {
  await withColumnFallback({ ...patch }, ["internal_only"], (payload) =>
    supabase.from("subjects").update(payload).eq("id", id)
  );
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
  await withColumnFallback({ ...slot, device_id: pin }, ["slot_type"], (payload) =>
    supabase.from("timetable_slots").insert(payload)
  );
}

export async function updateSlot(id: string, patch: Partial<TimetableSlot>): Promise<void> {
  await withColumnFallback({ ...patch }, ["slot_type"], (payload) =>
    supabase.from("timetable_slots").update(payload).eq("id", id)
  );
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

// ---------- semester archives ----------

export async function fetchArchives(pin: string): Promise<SemesterArchive[]> {
  const { data, error } = await supabase
    .from("semester_archives")
    .select("*")
    .eq("device_id", pin)
    .order("archived_at", { ascending: false });
  // Table may not exist yet (migration 010) — degrade to empty.
  if (error) return [];
  return (data as SemesterArchive[]) ?? [];
}

export async function insertArchive(
  pin: string,
  archive: Omit<SemesterArchive, "id" | "device_id" | "archived_at">
): Promise<void> {
  const { error } = await supabase
    .from("semester_archives")
    .insert({ ...archive, device_id: pin });
  throwIf(error);
}

export async function deleteArchive(id: string): Promise<void> {
  const { error } = await supabase.from("semester_archives").delete().eq("id", id);
  throwIf(error);
}

/** Wipe the active semester's academic data (keeps settings + archives). */
export async function clearAcademicData(pin: string): Promise<void> {
  // subjects cascade to timetable_slots, attendance, marks
  for (const table of ["deadlines", "subjects", "timetable_slots", "attendance", "marks"]) {
    const { error } = await supabase.from(table).delete().eq("device_id", pin);
    throwIf(error);
  }
}

// ---------- data management ----------

export async function deleteAllData(pin: string): Promise<void> {
  // subjects cascade to timetable_slots, attendance, marks
  for (const table of [
    "deadlines",
    "subjects",
    "timetable_slots",
    "attendance",
    "marks",
    "settings",
  ]) {
    const { error } = await supabase.from(table).delete().eq("device_id", pin);
    throwIf(error);
  }
  // archives table may not exist; ignore failure
  await supabase.from("semester_archives").delete().eq("device_id", pin);
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
    acadkit_export: 1,
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

export interface AcadkitExport {
  acadkit_export?: number;
  subjects?: Subject[];
  timetable?: TimetableSlot[];
  deadlines?: Deadline[];
  settings?: Partial<Settings> | null;
}

export interface ImportOptions {
  subjects: boolean; // subjects + timetable
  deadlines: boolean;
  holidays: boolean; // declared holidays + sem dates
}

async function insertWithRowFallback(
  table: string,
  rows: Record<string, unknown>[],
  optionalColumns: string[]
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabase.from(table).insert(rows);
  if (!error) return;
  const missing = optionalColumns.find((c) => error.message.includes(`'${c}'`));
  if (!missing) throw new Error(error.message);
  const stripped = rows.map((r) => {
    const copy = { ...r };
    delete copy[missing];
    return copy;
  });
  const retry = await supabase.from(table).insert(stripped);
  throwIf(retry.error);
}

/**
 * Import a previously-exported file. Subjects are matched to the
 * current account by **code** so existing attendance/marks stay linked;
 * missing subjects are created. Timetable and deadlines are replaced
 * for the chosen categories (attendance/marks are never touched).
 */
export async function importData(
  pin: string,
  data: AcadkitExport,
  opts: ImportOptions
): Promise<{ subjects: number; slots: number; deadlines: number }> {
  const current = await fetchSubjects(pin);
  const codeToId = new Map<string, string>();
  for (const s of current) codeToId.set(s.code, s.id);
  const importedIdToCode = new Map<string, string>();
  for (const s of data.subjects ?? []) importedIdToCode.set(s.id, s.code);

  let createdSubjects = 0;
  let createdSlots = 0;
  let createdDeadlines = 0;

  if (opts.subjects) {
    const missing = (data.subjects ?? []).filter((s) => !codeToId.has(s.code));
    const rows = missing.map((s) => {
      const id = crypto.randomUUID();
      codeToId.set(s.code, id);
      return {
        id,
        device_id: pin,
        code: s.code,
        name: s.name,
        credits: s.credits ?? 0,
        type: s.type ?? "theory",
        faculty: s.faculty ?? null,
        color_hex: s.color_hex ?? "#7c6af7",
        internal_only: s.internal_only ?? false,
      };
    });
    await insertWithRowFallback("subjects", rows, ["internal_only"]);
    createdSubjects = rows.length;

    await clearTimetable(pin);
    const slots = (data.timetable ?? [])
      .map((sl) => {
        const code = importedIdToCode.get(sl.subject_id);
        const sid = code ? codeToId.get(code) : undefined;
        if (!sid) return null;
        return {
          device_id: pin,
          subject_id: sid,
          day_order: sl.day_order,
          start_time: sl.start_time,
          end_time: sl.end_time,
          room: sl.room ?? null,
          slot_type: sl.slot_type ?? "theory",
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    await insertWithRowFallback("timetable_slots", slots, ["slot_type"]);
    createdSlots = slots.length;
  }

  if (opts.deadlines) {
    const { error } = await supabase.from("deadlines").delete().eq("device_id", pin);
    throwIf(error);
    const ds = (data.deadlines ?? []).map((d) => {
      const code = d.subject_id ? importedIdToCode.get(d.subject_id) : undefined;
      return {
        device_id: pin,
        subject_id: code ? codeToId.get(code) ?? null : null,
        title: d.title,
        type: d.type,
        due_date: d.due_date,
        status: d.status ?? "pending",
        priority: d.priority ?? "medium",
      };
    });
    await insertWithRowFallback("deadlines", ds, []);
    createdDeadlines = ds.length;
  }

  if (opts.holidays && data.settings) {
    await updateSettings(pin, {
      declared_holidays: data.settings.declared_holidays ?? [],
      ...(data.settings.sem_start ? { sem_start: data.settings.sem_start } : {}),
      ...(data.settings.sem_end ? { sem_end: data.settings.sem_end } : {}),
    });
  }

  return { subjects: createdSubjects, slots: createdSlots, deadlines: createdDeadlines };
}
