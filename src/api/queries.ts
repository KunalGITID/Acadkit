import type { Suggestion, SuggestionStatus } from "@/lib/suggestions";
import { labelMatchKey } from "@/lib/componentLabel";
import { supabase } from "@/lib/supabase";
import { SEED_SUBJECTS, SEMESTER_START, SEMESTER_END } from "@/data/semester";
import type {
  AttendanceRecord,
  AttendanceStatus,
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
 * The table isn't there at all: a project that hasn't run its migration.
 * That is "nothing yet", and the only error a read may swallow — any
 * other failure returned as an empty list would overwrite good cached
 * data with nothing, and every number built on it would jump.
 */
function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205";
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
 * An upsert, not an update: an update against a PIN with no settings row
 * matches nothing and succeeds, so every change made on such an account
 * was silently thrown away. Only the columns in `patch` are written when
 * the row exists; a missing row is created with the column defaults.
 */
export async function updateSettings(pin: string, patch: Partial<Settings>): Promise<void> {
  const { error } = await supabase
    .from("settings")
    .upsert({ ...patch, device_id: pin }, { onConflict: "device_id" });
  throwIf(error);
}

/**
 * First-time setup for a PIN you have already claimed: settings row +
 * starter subjects.
 *
 * Safe to run on a PIN that has data — each part is only written when it
 * is missing — so retrying a setup that failed halfway can neither reset
 * your settings nor seed the subjects twice.
 */
export async function seedAccount(pin: string): Promise<void> {
  if (!(await fetchSettings(pin))) {
    const { error } = await supabase.from("settings").insert({
      device_id: pin,
      semester: 3,
      sem_start: SEMESTER_START,
      sem_end: SEMESTER_END,
      declared_holidays: [],
    });
    throwIf(error);
  }
  const { count, error } = await supabase
    .from("subjects")
    .select("id", { count: "exact", head: true })
    .eq("device_id", pin);
  throwIf(error);
  if (!count) {
    const { error: subErr } = await supabase
      .from("subjects")
      .insert(SEED_SUBJECTS.map((s) => ({ ...s, device_id: pin })));
    throwIf(subErr);
  }
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

/**
 * `id` is generated on the client and sent with the row, so the row the
 * UI shows before the write lands is the one the server stores — an edit
 * queued behind the insert while offline then targets a real row, not a
 * placeholder id the database would reject.
 */
export async function insertSubject(
  pin: string,
  subject: Omit<Subject, "device_id" | "created_at">
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
  slot: Omit<TimetableSlot, "device_id" | "created_at">
): Promise<void> {
  const { error } = await supabase.from("timetable_slots").insert({ ...slot, device_id: pin });
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

/**
 * Swap this PIN's rows in `table` for `rows`, inserting before deleting:
 * if the insert is rejected, the old rows are still there. Deleting first
 * meant a failed import left you with no timetable at all.
 */
async function replaceRows(
  table: "timetable_slots" | "deadlines",
  pin: string,
  rows: Record<string, unknown>[]
): Promise<void> {
  const { data: old, error } = await supabase.from(table).select("id").eq("device_id", pin);
  throwIf(error);
  const { error: insErr } = await supabase.from(table).insert(rows);
  throwIf(insErr);
  const ids = (old ?? []).map((r) => r.id as string);
  // Chunked: every id rides in the URL.
  for (let i = 0; i < ids.length; i += 100) {
    const { error: delErr } = await supabase.from(table).delete().in("id", ids.slice(i, i + 100));
    throwIf(delErr);
  }
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

  await replaceRows("timetable_slots", pin, rows);
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

/**
 * Write one status across a stretch of classes.
 *
 * `replace` is what separates "catch up on a week I never marked" from
 * "I was actually away, change what's there" — and it is the caller's
 * decision, not a default, because the second one overwrites answers
 * the user gave by hand. Without it this behaves like auto-marking:
 * duplicates are ignored, so a row that appeared since the plan was
 * computed survives.
 *
 * These rows are never `auto_marked`. Clearing the app's guesses must
 * not also clear a week you deliberately marked absent.
 */
export async function markRange(
  pin: string,
  rows: Array<Pick<AttendanceRecord, "subject_id" | "date" | "start_time" | "end_time">>,
  status: AttendanceStatus,
  replace: boolean
): Promise<number> {
  if (!rows.length) return 0;
  const payload = rows.map((r) => ({ ...r, device_id: pin, status, auto_marked: false }));
  const { error } = await supabase.from("attendance").upsert(payload, {
    onConflict: "device_id,subject_id,date,start_time",
    ignoreDuplicates: !replace,
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
    throwIf(error);
    result.snapshots = rows.length;
  }

  if (input.marks.length) {
    // Both reads are checked: a failed one used to come back as "no
    // subjects" (every code reported unmatched) or "no portal marks yet"
    // (every mark inserted again, into the unique index).
    const { data: subjects, error: subErr } = await supabase
      .from("subjects")
      .select("id,code")
      .eq("device_id", pin);
    throwIf(subErr);
    const byCode = new Map(
      (subjects ?? []).map((s) => [String(s.code).trim().toUpperCase(), s.id as string])
    );

    // Only rows this sync owns are touched, so a mark typed by hand is
    // never overwritten by a re-import.
    const { data: existing, error: exErr } = await supabase
      .from("marks")
      .select("id,subject_id,label")
      .eq("device_id", pin)
      .eq("source", "portal");
    throwIf(exErr);
    const seen = new Map(
      (existing ?? []).map((m) => [`${m.subject_id}|${m.label}`, m.id as string])
    );

    const unmatched = new Set<string>();
    const updates: Record<string, unknown>[] = [];
    const inserts: Record<string, unknown>[] = [];
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
      if (id) updates.push({ id, ...row });
      else inserts.push(row);
    }
    // Two requests, not one per mark.
    if (updates.length) {
      const { error } = await supabase.from("marks").upsert(updates, { onConflict: "id" });
      throwIf(error);
      result.marksUpdated = updates.length;
    }
    if (inserts.length) {
      const { error } = await supabase.from("marks").insert(inserts);
      throwIf(error);
      result.marksAdded = inserts.length;
    }
    result.unmatchedCodes = [...unmatched];
  }

  return result;
}

// ---------- portal snapshots ----------

/**
 * Per-subject attendance totals as the portal last reported them.
 * Returns [] if migration 012 hasn't been run, so the app keeps working
 * on manual attendance alone. Any other failure throws: returning [] for
 * a dropped request replaced the cached baseline with nothing, and every
 * attendance number fell back to hand-marked classes until the next
 * refetch.
 */
export async function fetchPortalSnapshots(pin: string): Promise<PortalSnapshot[]> {
  const { data, error } = await supabase
    .from("portal_snapshots")
    .select("*")
    .eq("device_id", pin);
  if (isMissingTable(error)) return [];
  throwIf(error);
  return (data as PortalSnapshot[]) ?? [];
}

async function clearPortalSnapshots(pin: string): Promise<void> {
  const { error } = await supabase.from("portal_snapshots").delete().eq("device_id", pin);
  if (!isMissingTable(error)) throwIf(error);
}

export async function insertMark(
  pin: string,
  mark: Omit<Mark, "device_id" | "added_at">
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
  deadline: Omit<Deadline, "device_id" | "created_at">
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
  // Table may not exist yet (migration 010) — degrade to empty. Only
  // then: an empty history for a dropped request hides your CGPA ladder.
  if (isMissingTable(error)) return [];
  throwIf(error);
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
  // archives / snapshots tables may not exist; nothing else is ignored
  const { error } = await supabase.from("semester_archives").delete().eq("device_id", pin);
  if (!isMissingTable(error)) throwIf(error);
  await clearPortalSnapshots(pin);
}

/**
 * Everything the account holds, as one file. Archives and portal totals
 * are in it: without the archives it was a backup that lost your CGPA
 * history, and without the portal totals, restored attendance fell back
 * to hand-marked classes only.
 */
export async function exportAllData(pin: string) {
  const [settings, subjects, timetable, attendance, marks, deadlines, archives, portalSnapshots] =
    await Promise.all([
      fetchSettings(pin),
      fetchSubjects(pin),
      fetchTimetable(pin),
      fetchAttendance(pin),
      fetchMarks(pin),
      fetchDeadlines(pin),
      fetchArchives(pin),
      fetchPortalSnapshots(pin),
    ]);
  return {
    acadkit_export: 1,
    exported_at: new Date().toISOString(),
    settings,
    subjects,
    timetable,
    attendance,
    marks,
    deadlines,
    archives,
    portal_snapshots: portalSnapshots,
  };
}

export interface AcadkitExport {
  acadkit_export?: number;
  subjects?: Subject[];
  timetable?: TimetableSlot[];
  attendance?: AttendanceRecord[];
  marks?: Mark[];
  deadlines?: Deadline[];
  settings?: Partial<Settings> | null;
  archives?: SemesterArchive[];
  portal_snapshots?: PortalSnapshot[];
}

export interface ImportOptions {
  subjects: boolean; // subjects + timetable
  history: boolean; // attendance, marks and portal totals
  deadlines: boolean;
  holidays: boolean; // declared holidays + sem dates
  archives: boolean; // past semesters
}

export interface ImportResult {
  subjects: number;
  slots: number;
  attendance: number;
  marks: number;
  deadlines: number;
  archives: number;
}

const codeKey = (code: string) => code.trim().toUpperCase();

/**
 * Import a previously-exported file.
 *
 * Subjects are matched to the current account by **code**, so existing
 * attendance and marks stay linked; missing subjects are created with
 * their marks plans, targets and medical leave. What's already here is
 * never lost to a file that lacks it:
 *
 *  - The timetable and deadlines are replaced only when the file has
 *    some — a file without a timetable used to clear yours and put
 *    nothing back — and new rows go in before old ones come out.
 *  - Attendance, marks, portal totals and archives are merged, never
 *    replaced: a class you have already marked, a component you already
 *    have, a newer portal total or an archive of the same name stays.
 */
export async function importData(
  pin: string,
  data: AcadkitExport,
  opts: ImportOptions
): Promise<ImportResult> {
  const result: ImportResult = { subjects: 0, slots: 0, attendance: 0, marks: 0, deadlines: 0, archives: 0 };
  const current = await fetchSubjects(pin);
  const codeToId = new Map(current.map((s) => [codeKey(s.code), s.id]));
  const importedIdToCode = new Map((data.subjects ?? []).map((s) => [s.id, codeKey(s.code)]));
  /** This account's id for a subject id from the file. */
  const localId = (importedId: string | null | undefined): string | undefined => {
    const code = importedId ? importedIdToCode.get(importedId) : undefined;
    return code ? codeToId.get(code) : undefined;
  };

  if (opts.subjects) {
    const rows = (data.subjects ?? [])
      .filter((s) => !codeToId.has(codeKey(s.code)))
      .map((s) => {
        const id = crypto.randomUUID();
        codeToId.set(codeKey(s.code), id);
        return {
          id,
          device_id: pin,
          code: s.code,
          name: s.name,
          credits: s.credits ?? 0,
          type: s.type ?? "theory",
          faculty: s.faculty ?? null,
          color_hex: s.color_hex ?? "#7c6af7",
          short_name: s.short_name ?? null,
          internal_only: s.internal_only ?? false,
          assessment: s.assessment ?? null,
          target_grade: s.target_grade ?? null,
          medical_leave: s.medical_leave ?? null,
        };
      });
    if (rows.length) {
      const { error } = await supabase.from("subjects").insert(rows);
      throwIf(error);
    }
    result.subjects = rows.length;

    const slots = (data.timetable ?? [])
      .map((sl) => {
        const sid = localId(sl.subject_id);
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
    if (slots.length) await replaceRows("timetable_slots", pin, slots);
    result.slots = slots.length;
  }

  if (opts.history) {
    const attendance = (data.attendance ?? [])
      .map((r) => {
        const sid = localId(r.subject_id);
        if (!sid) return null;
        return {
          device_id: pin,
          subject_id: sid,
          date: r.date,
          start_time: r.start_time,
          end_time: r.end_time,
          status: r.status,
          auto_marked: r.auto_marked ?? false,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    if (attendance.length) {
      // ignoreDuplicates: a class already marked here keeps its answer.
      // select() returns only the rows actually written.
      const { data: written, error } = await supabase
        .from("attendance")
        .upsert(attendance, { onConflict: "device_id,subject_id,date,start_time", ignoreDuplicates: true })
        .select("id");
      throwIf(error);
      result.attendance = written?.length ?? 0;
    }

    // A component this account already has — same subject, same label by
    // match key, same side of the split — is left alone rather than doubled.
    const markKey = (subjectId: string, m: Pick<Mark, "label" | "is_external">) =>
      `${subjectId}|${labelMatchKey(m.label)}|${m.is_external ? "x" : "i"}`;
    const have = new Set((await fetchMarks(pin)).map((m) => markKey(m.subject_id, m)));
    const marks: Record<string, unknown>[] = [];
    for (const m of data.marks ?? []) {
      const sid = localId(m.subject_id);
      if (!sid || have.has(markKey(sid, m))) continue;
      have.add(markKey(sid, m));
      marks.push({
        device_id: pin,
        subject_id: sid,
        component_type: m.component_type,
        label: m.label,
        marks_obtained: m.marks_obtained,
        max_marks: m.max_marks,
        is_external: m.is_external,
        source: m.source ?? "manual",
      });
    }
    if (marks.length) {
      const { error } = await supabase.from("marks").insert(marks);
      throwIf(error);
    }
    result.marks = marks.length;

    // Portal totals are the attendance baseline; a file's only wins where
    // it is newer than what this account already has.
    const here = new Map((await fetchPortalSnapshots(pin)).map((s) => [codeKey(s.subject_code), s.as_of]));
    const snapshots = (data.portal_snapshots ?? [])
      .filter((s) => {
        const asOf = here.get(codeKey(s.subject_code));
        return !asOf || s.as_of > asOf;
      })
      .map((s) => ({
        device_id: pin,
        subject_code: s.subject_code,
        conducted: s.conducted,
        absent: s.absent,
        percentage: s.percentage,
        as_of: s.as_of,
        synced_at: s.synced_at ?? new Date().toISOString(),
      }));
    if (snapshots.length) {
      const { error } = await supabase
        .from("portal_snapshots")
        .upsert(snapshots, { onConflict: "device_id,subject_code" });
      throwIf(error);
    }
  }

  if (opts.deadlines) {
    const deadlines = (data.deadlines ?? []).map((d) => ({
      device_id: pin,
      subject_id: localId(d.subject_id) ?? null,
      title: d.title,
      type: d.type,
      due_date: d.due_date,
      status: d.status ?? "pending",
      priority: d.priority ?? "medium",
      max_marks: d.max_marks ?? null,
    }));
    if (deadlines.length) await replaceRows("deadlines", pin, deadlines);
    result.deadlines = deadlines.length;
  }

  if (opts.archives) {
    const labels = new Set((await fetchArchives(pin)).map((a) => a.label.trim().toLowerCase()));
    const archives = (data.archives ?? [])
      .filter((a) => !labels.has(a.label.trim().toLowerCase()))
      .map((a) => ({
        device_id: pin,
        label: a.label,
        sgpa: a.sgpa,
        credits: a.credits,
        summary: a.summary ?? [],
        sem_start: a.sem_start,
        sem_end: a.sem_end,
        ...(a.archived_at ? { archived_at: a.archived_at } : {}),
      }));
    if (archives.length) {
      const { error } = await supabase.from("semester_archives").insert(archives);
      throwIf(error);
    }
    result.archives = archives.length;
  }

  if (opts.holidays && data.settings) {
    await updateSettings(pin, {
      declared_holidays: data.settings.declared_holidays ?? [],
      ...(data.settings.sem_start ? { sem_start: data.settings.sem_start } : {}),
      ...(data.settings.sem_end ? { sem_end: data.settings.sem_end } : {}),
    });
  }

  return result;
}

// ---------- suggestions (migration 026) ----------

export async function fetchSuggestions(pin: string): Promise<Suggestion[]> {
  const { data, error } = await supabase
    .from("suggestions")
    .select("*")
    .eq("device_id", pin)
    .eq("status", "pending");
  // Before migration 026 runs the table doesn't exist; that is "nothing
  // suggested", not an error worth a toast on the home screen.
  if (isMissingTable(error)) return [];
  throwIf(error);
  return (data as Suggestion[]) ?? [];
}

export async function setSuggestionStatus(id: string, status: SuggestionStatus): Promise<void> {
  const { error } = await supabase.from("suggestions").update({ status }).eq("id", id);
  throwIf(error);
}
