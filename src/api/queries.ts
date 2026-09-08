import { toast } from "sonner";
import type { SharedCard } from "@/lib/compare";
import { supabase } from "@/lib/supabase";
import { SEED_SUBJECTS, SEMESTER_START, SEMESTER_END } from "@/data/semester";
import type {
  AttendanceRecord,
  Deadline,
  Mark,
  PortalSnapshot,
  SemesterArchive,
  Settings,
  Subject,
  TimetableSlot,
} from "@/types";

function throwIf(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

/**
 * Columns arrive by migration, so a write naming one the project
 * hasn't got retries without it rather than failing outright — and
 * says which field it dropped, since a value that silently reverts to
 * its previous state is the most confusing thing this can do.
 */

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
  for all to anon using (true) with check (true);

-- Portal sync (012): attendance snapshots + de-duplicated portal marks
create table if not exists portal_snapshots (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  subject_code text not null,
  conducted numeric not null,
  absent numeric not null,
  percentage numeric,
  as_of date not null default current_date,
  synced_at timestamptz not null default now(),
  unique (device_id, subject_code)
);
create index if not exists idx_portal_snapshots_device on portal_snapshots(device_id);
alter table portal_snapshots enable row level security;
drop policy if exists "anon_all_portal_snapshots" on portal_snapshots;
create policy "anon_all_portal_snapshots" on portal_snapshots
  for all to anon using (true) with check (true);
alter table marks
  add column if not exists source text not null default 'manual'
  check (source in ('manual', 'portal'));
create unique index if not exists idx_marks_portal_unique
  on marks(device_id, subject_id, label)
  where source = 'portal';

-- Auto-marked attendance (013)
alter table attendance
  add column if not exists auto_marked boolean not null default false;
create index if not exists idx_attendance_auto_marked
  on attendance(device_id, auto_marked) where auto_marked;
alter table settings
  add column if not exists auto_mark_present boolean not null default false;

-- Assessment plan + per-subject target (021)
alter table subjects
  add column if not exists assessment jsonb,
  add column if not exists target_grade text;
alter table settings add column if not exists assumed_external_pct numeric;
alter table subjects add column if not exists medical_leave boolean;
alter table subjects drop constraint if exists subjects_target_grade_check;
alter table subjects add constraint subjects_target_grade_check
  check (target_grade is null or target_grade in ('O','A+','A','B+','B','C'));`;

const OPTIONAL_COLUMNS: Array<{ table: string; column: string; enables: string }> = [
  { table: "settings", column: "name", enables: "greeting name that follows your PIN" },
  { table: "timetable_slots", column: "slot_type", enables: "theory/lab class tags" },
  { table: "subjects", column: "internal_only", enables: "internal-only subjects" },
  { table: "subjects", column: "assessment", enables: "per-subject mark split & test plan" },
  { table: "subjects", column: "medical_leave", enables: "medical-leave attendance (65%)" },
  { table: "settings", column: "assumed_external_pct", enables: "assumed end-sem score" },
  { table: "semester_archives", column: "id", enables: "semester history & CGPA" },
  { table: "portal_snapshots", column: "id", enables: "portal attendance sync" },
  { table: "marks", column: "source", enables: "portal marks sync" },
  { table: "attendance", column: "auto_marked", enables: "auto-marking past classes" },
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

  // Loop rather than strip once: PostgREST names a single unknown column
  // per error, so a migration that adds two (021 adds `assessment` and
  // `target_grade`) surfaces the second only after the first is gone.
  // Stripping one and giving up turned a recoverable save into a thrown
  // error on exactly the subjects this fallback exists to protect.
  const stripped: Record<string, unknown> = { ...payload };
  let last = error;
  for (let i = 0; i < optionalColumns.length; i++) {
    const missing = optionalColumns.find(
      (col) => col in stripped && last.message.includes(`'${col}'`)
    );
    if (!missing) throw new Error(last.message);
    delete stripped[missing];
    const retry = await run(stripped);
    if (!retry.error) break;
    last = retry.error;
    if (i === optionalColumns.length - 1) throw new Error(last.message);
  }

  // Loud, and it names the column. Silently dropping a field means the
  // value you just typed reappears as whatever it was before, with no
  // explanation — the single most confusing thing this fallback can do.
  // Worth knowing: a column can be missing from PostgREST's *schema
  // cache* even after the migration has run, in which case the fix is
  // to reload the cache rather than to run anything again.
  const dropped = optionalColumns.filter((col) => !(col in stripped) && col in payload);
  toast.warning(`Saved without “${dropped.join("”, “")}”`, {
    description:
      "That column isn't visible to the API yet. Settings → Finish setup has the SQL; if you've already run it, reload the schema cache (Supabase → API → Reload).",
    duration: 10000,
  });
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

/**
 * Settings columns arrive by migration too, so a write that names one
 * the project hasn't got should degrade rather than throw — the same
 * treatment `subjects` has had since 007.
 */
export async function updateSettings(pin: string, patch: Partial<Settings>): Promise<void> {
  await withColumnFallback(
    { ...patch },
    ["assumed_external_pct", "name", "theme", "theme_mode", "auto_mark_present"],
    (payload) => supabase.from("settings").update(payload).eq("device_id", pin)
  );
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
  await withColumnFallback(
    { ...subject, device_id: pin },
    ["internal_only", "assessment", "target_grade", "medical_leave"],
    (payload) =>
      supabase.from("subjects").insert(payload)
  );
}

export async function updateSubject(id: string, patch: Partial<Subject>): Promise<void> {
  await withColumnFallback(
    { ...patch },
    ["internal_only", "assessment", "target_grade", "medical_leave"],
    (payload) => supabase.from("subjects").update(payload).eq("id", id)
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

export interface TimetableImportResult {
  slots: number;
  /** Codes in the grid that matched no subject on this account. */
  unmatchedCodes: string[];
}

/**
 * Replace the timetable with a grid read off the portal.
 *
 * Replace, not merge: a timetable is a whole week, and merging an
 * imported one into an existing one leaves last term's slots behind on
 * any day the new grid happens not to cover — which is the silent,
 * unfindable version of the problem importing was meant to solve.
 * Attendance is untouched, and survives because a record is keyed by
 * (subject, date, start_time) rather than by a slot row.
 *
 * Subjects are matched by code and never created. A timetable that
 * invents subjects would put rows in every projection for courses you
 * are not taking; the unmatched codes come back to be shown instead.
 */
export async function importTimetable(
  pin: string,
  slots: Array<{
    subject_code: string;
    day_order: number;
    start_time: string;
    end_time: string;
    slot_type: "theory" | "lab";
    room: string | null;
  }>
): Promise<TimetableImportResult> {
  const subjects = await fetchSubjects(pin);
  const byCode = new Map(subjects.map((s) => [s.code.trim().toUpperCase(), s.id]));

  const unmatched = new Set<string>();
  const rows = slots
    .map((sl) => {
      const id = byCode.get(sl.subject_code.trim().toUpperCase());
      if (!id) {
        unmatched.add(sl.subject_code);
        return null;
      }
      return {
        device_id: pin,
        subject_id: id,
        day_order: sl.day_order,
        // The DB column is a time; seconds keep it unambiguous.
        start_time: `${sl.start_time}:00`,
        end_time: `${sl.end_time}:00`,
        slot_type: sl.slot_type,
        room: sl.room,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  // Nothing matched: leave the timetable alone rather than clearing it
  // for an import that has nothing to put back.
  if (!rows.length) return { slots: 0, unmatchedCodes: [...unmatched] };

  await clearTimetable(pin);
  await insertWithRowFallback("timetable_slots", rows, ["slot_type"]);
  return { slots: rows.length, unmatchedCodes: [...unmatched] };
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

/**
 * Write auto-marked `present` rows for past classes the user never
 * touched. Uses ignoreDuplicates so a row that appeared since the
 * pending list was computed is skipped rather than overwritten — the
 * user's answer always wins over the app's assumption.
 */
export async function insertAutoMarks(
  pin: string,
  rows: Array<Pick<AttendanceRecord, "subject_id" | "date" | "start_time" | "end_time">>
): Promise<number> {
  if (!rows.length) return 0;
  const payload = rows.map((r) => ({
    ...r,
    device_id: pin,
    status: "present" as const,
    auto_marked: true,
  }));
  const { error } = await supabase
    .from("attendance")
    .upsert(payload, {
      onConflict: "device_id,subject_id,date,start_time",
      ignoreDuplicates: true,
    });
  throwIf(error);
  return rows.length;
}

/** Remove every auto-marked row, leaving hand-marked history untouched. */
export async function deleteAutoMarks(pin: string): Promise<void> {
  const { error } = await supabase
    .from("attendance")
    .delete()
    .eq("device_id", pin)
    .eq("auto_marked", true);
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

// ---------- portal import (from a pasted page) ----------

/**
 * Write what was parsed out of a pasted portal page.
 *
 * The same shape the portal-ingest edge function writes, run under the
 * user's own session instead. The bookmarklet needs a server-side
 * endpoint because it runs on the portal's origin with no AcadKit
 * session and would otherwise have to carry a credential; the app is
 * already signed in, so it just writes.
 */
export interface PortalImportResult {
  snapshots: number;
  marksAdded: number;
  marksUpdated: number;
  /** Codes the portal reported that no subject in AcadKit matches. */
  unmatchedCodes: string[];
}

export async function importPortalData(
  pin: string,
  input: {
    attendance: Array<{
      subject_code: string;
      conducted: number;
      absent: number;
      percentage: number | null;
    }>;
    marks: Array<{
      subject_code: string;
      label: string;
      max_marks: number;
      marks_obtained: number;
      component_type: string;
    }>;
  }
): Promise<PortalImportResult> {
  const today = new Date().toLocaleDateString("en-CA");
  const result: PortalImportResult = {
    snapshots: 0,
    marksAdded: 0,
    marksUpdated: 0,
    unmatchedCodes: [],
  };

  if (input.attendance.length) {
    const rows = input.attendance.map((a) => ({
      device_id: pin,
      subject_code: a.subject_code,
      conducted: a.conducted,
      absent: a.absent,
      percentage: a.percentage,
      as_of: today,
      synced_at: new Date().toISOString(),
    }));
    const { error } = await supabase
      .from("portal_snapshots")
      .upsert(rows, { onConflict: "device_id,subject_code" });
    if (error) throw error;
    result.snapshots = rows.length;
  }

  if (input.marks.length) {
    const { data: subjects } = await supabase
      .from("subjects")
      .select("id,code")
      .eq("device_id", pin);
    const byCode = new Map(
      (subjects ?? []).map((s) => [String(s.code).trim().toUpperCase(), s.id as string])
    );

    // Only rows this sync owns are touched, so a mark typed by hand is
    // never overwritten by a re-import.
    const { data: existing } = await supabase
      .from("marks")
      .select("id,subject_id,label")
      .eq("device_id", pin)
      .eq("source", "portal");
    const seen = new Map(
      (existing ?? []).map((m) => [`${m.subject_id}|${m.label}`, m.id as string])
    );

    const unmatched = new Set<string>();
    for (const m of input.marks) {
      const subjectId = byCode.get(m.subject_code.trim().toUpperCase());
      if (!subjectId) {
        unmatched.add(m.subject_code);
        continue;
      }
      const row = {
        device_id: pin,
        subject_id: subjectId,
        component_type: m.component_type,
        label: m.label,
        marks_obtained: m.marks_obtained,
        max_marks: m.max_marks,
        is_external: false,
        source: "portal",
      };
      const id = seen.get(`${subjectId}|${m.label}`);
      if (id) {
        const { error } = await supabase.from("marks").update(row).eq("id", id);
        if (error) throw error;
        result.marksUpdated++;
      } else {
        const { error } = await supabase.from("marks").insert(row);
        if (error) throw error;
        result.marksAdded++;
      }
    }
    result.unmatchedCodes = [...unmatched];
  }

  return result;
}

// ---------- portal snapshots ----------

/**
 * Per-subject attendance totals as the portal last reported them.
 * Returns [] if migration 012 hasn't been run, so the app keeps working
 * on manual attendance alone.
 */
export async function fetchPortalSnapshots(pin: string): Promise<PortalSnapshot[]> {
  const { data, error } = await supabase
    .from("portal_snapshots")
    .select("*")
    .eq("device_id", pin);
  if (error) return [];
  return (data as PortalSnapshot[]) ?? [];
}

async function clearPortalSnapshots(pin: string): Promise<void> {
  await supabase.from("portal_snapshots").delete().eq("device_id", pin);
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

// ---------- push subscriptions ----------

export async function savePushSubscription(
  pin: string,
  sub: { endpoint: string; p256dh: string; auth: string }
): Promise<void> {
  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(
      { device_id: pin, endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth, ua: navigator.userAgent },
      { onConflict: "endpoint" }
    );
  throwIf(error);
}

export async function deletePushSubscription(endpoint: string): Promise<void> {
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  throwIf(error);
}

/** Wipe the active semester's academic data (keeps settings + archives). */
export async function clearAcademicData(pin: string): Promise<void> {
  // subjects cascade to timetable_slots, attendance, marks
  for (const table of ["deadlines", "subjects", "timetable_slots", "attendance", "marks"]) {
    const { error } = await supabase.from(table).delete().eq("device_id", pin);
    throwIf(error);
  }
  // may not exist until migration 012 is run
  await clearPortalSnapshots(pin);
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
  // archives / snapshots tables may not exist; ignore failure
  await supabase.from("semester_archives").delete().eq("device_id", pin);
  await clearPortalSnapshots(pin);
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

// ---------------------------------------------------------------------
// Shared comparison cards
// ---------------------------------------------------------------------

/**
 * Publish a frozen snapshot of your attendance under a random code.
 *
 * The payload is built by `buildSharedCard` and contains attendance
 * only — see src/lib/compare.ts for what is deliberately left out.
 */
export async function createShare(
  pin: string,
  code: string,
  payload: SharedCard
): Promise<void> {
  const { error } = await supabase.from("shared_cards").insert({
    code,
    device_id: pin,
    payload,
  });
  if (error) throw error;
}

/**
 * Read someone else's card by its code.
 *
 * Goes through the `get_shared_card` function rather than the table:
 * there is no select policy that would let one account read another's
 * row, because any policy permissive enough to allow "where code = $1"
 * would also allow listing every card.
 */
export async function fetchSharedCard(code: string): Promise<SharedCard | null> {
  const { data, error } = await supabase.rpc("get_shared_card", { p_code: code });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return (row?.payload as SharedCard) ?? null;
}
