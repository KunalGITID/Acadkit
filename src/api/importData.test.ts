import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Assessment, Subject } from "@/types";

/**
 * Import is where a backup either restores you or costs you data, so it
 * runs here against an in-memory stand-in for the Supabase client that
 * understands just the calls queries.ts makes.
 *
 * Every case below was a way to lose data: a file without a timetable
 * cleared yours, one without deadlines deleted them, new subjects lost
 * their marks plans, and attendance and marks never came back at all.
 */

type Row = Record<string, unknown>;
let db: Record<string, Row[]> = {};
let log: string[] = [];
let seq = 0;

function query(table: string) {
  let op: "select" | "insert" | "upsert" | "delete" | "update" = "select";
  let payload: Row[] = [];
  let upsertOpts: { onConflict?: string; ignoreDuplicates?: boolean } = {};
  let returnRows = false;
  let single = false;
  const filters: Array<(r: Row) => boolean> = [];

  function run() {
    const rows = (db[table] ??= []);
    log.push(`${op}:${table}`);
    const match = (r: Row) => filters.every((f) => f(r));
    if (op === "select") {
      const data = rows.filter(match);
      return { data: single ? (data[0] ?? null) : data, error: null, count: data.length };
    }
    if (op === "insert") {
      const added = payload.map((r) => ({ id: r.id ?? `gen-${++seq}`, ...r }));
      rows.push(...added);
      return { data: returnRows ? added : null, error: null };
    }
    if (op === "upsert") {
      const cols = (upsertOpts.onConflict ?? "id").split(",");
      const written: Row[] = [];
      for (const r of payload) {
        const hit = rows.find((x) => cols.every((c) => x[c] === r[c]));
        if (hit && upsertOpts.ignoreDuplicates) continue;
        if (hit) Object.assign(hit, r);
        else rows.push({ id: r.id ?? `gen-${++seq}`, ...r });
        written.push(hit ?? rows[rows.length - 1]);
      }
      return { data: returnRows ? written : null, error: null };
    }
    if (op === "delete") {
      db[table] = rows.filter((r) => !match(r));
      return { data: null, error: null };
    }
    rows.filter(match).forEach((r) => Object.assign(r, payload[0]));
    return { data: null, error: null };
  }

  const builder = {
    select() {
      if (op !== "select") returnRows = true;
      return builder;
    },
    eq(col: string, val: unknown) {
      filters.push((r) => r[col] === val);
      return builder;
    },
    in(col: string, vals: unknown[]) {
      filters.push((r) => vals.includes(r[col]));
      return builder;
    },
    order() {
      return builder;
    },
    maybeSingle() {
      single = true;
      return builder;
    },
    insert(rows: Row | Row[]) {
      op = "insert";
      payload = ([] as Row[]).concat(rows);
      return builder;
    },
    upsert(rows: Row | Row[], opts?: typeof upsertOpts) {
      op = "upsert";
      payload = ([] as Row[]).concat(rows);
      upsertOpts = opts ?? {};
      return builder;
    },
    delete() {
      op = "delete";
      return builder;
    },
    update(patch: Row) {
      op = "update";
      payload = [patch];
      return builder;
    },
    then(resolve: (v: unknown) => void, reject: (e: unknown) => void) {
      try {
        resolve(run());
      } catch (err) {
        reject(err);
      }
    },
  };
  return builder;
}

vi.mock("@/lib/supabase", () => ({ supabase: { from: (t: string) => query(t) } }));

const { exportAllData, importData } = await import("@/api/queries");

const PIN = "0404";
const NONE = { subjects: false, history: false, deadlines: false, holidays: false, archives: false };

const subject = (id: string, code: string, extra: Partial<Subject> = {}): Subject => ({
  id,
  device_id: PIN,
  code,
  name: code,
  credits: 4,
  type: "theory",
  faculty: null,
  color_hex: "#000",
  ...extra,
});

beforeEach(() => {
  seq = 0;
  log = [];
  db = {
    subjects: [{ ...subject("here-dsa", "21CSC201J") }],
    timetable_slots: [
      { id: "slot-a", device_id: PIN, subject_id: "here-dsa", day_order: 1, start_time: "08:00:00", end_time: "08:50:00" },
      { id: "slot-b", device_id: PIN, subject_id: "here-dsa", day_order: 2, start_time: "08:00:00", end_time: "08:50:00" },
    ],
    deadlines: [{ id: "dl-1", device_id: PIN, subject_id: "here-dsa", title: "FT-2", type: "exam", due_date: "2026-10-10T09:00:00Z" }],
    attendance: [
      { id: "att-1", device_id: PIN, subject_id: "here-dsa", date: "2026-09-01", start_time: "08:00:00", end_time: "08:50:00", status: "absent" },
    ],
    marks: [
      { id: "m-1", device_id: PIN, subject_id: "here-dsa", component_type: "CT", label: "FT-1", marks_obtained: 4, max_marks: 5, is_external: false },
    ],
    portal_snapshots: [],
    semester_archives: [{ id: "ar-1", device_id: PIN, label: "Semester 2", sgpa: 8.4, credits: 22, summary: [] }],
    settings: [],
  };
});

describe("importData never loses what the file doesn't have", () => {
  it("leaves the timetable alone when the file has none", async () => {
    await importData(PIN, { subjects: [subject("file-dsa", "21CSC201J")], timetable: [] }, { ...NONE, subjects: true });
    expect(db.timetable_slots.map((s) => s.id)).toEqual(["slot-a", "slot-b"]);
  });

  it("replaces the timetable when the file has one, inserting before deleting", async () => {
    await importData(
      PIN,
      {
        subjects: [subject("file-dsa", "21CSC201J")],
        timetable: [{ id: "x", device_id: "9999", subject_id: "file-dsa", day_order: 3, start_time: "10:00:00", end_time: "10:50:00", room: null }],
      },
      { ...NONE, subjects: true }
    );
    expect(db.timetable_slots).toHaveLength(1);
    expect(db.timetable_slots[0]).toMatchObject({ subject_id: "here-dsa", day_order: 3, device_id: PIN });
    expect(log.indexOf("insert:timetable_slots")).toBeLessThan(log.indexOf("delete:timetable_slots"));
  });

  it("leaves deadlines alone when the file has none", async () => {
    await importData(PIN, { deadlines: [] }, { ...NONE, deadlines: true });
    expect(db.deadlines.map((d) => d.id)).toEqual(["dl-1"]);
  });

  it("creates missing subjects with their marks plan, target and medical leave", async () => {
    const assessment: Assessment = {
      internal: 60,
      complete: true,
      components: [{ key: "k", label: "FT-1", type: "CT", max: 15 }],
    };
    await importData(
      PIN,
      { subjects: [subject("file-ds", "21CSS202T", { assessment, target_grade: "A", medical_leave: true })] },
      { ...NONE, subjects: true }
    );
    const created = db.subjects.find((s) => s.code === "21CSS202T");
    expect(created).toMatchObject({ assessment, target_grade: "A", medical_leave: true, device_id: PIN });
  });
});

describe("importData restores attendance, marks and archives by merging", () => {
  const file = {
    subjects: [subject("file-dsa", "21CSC201J")],
    attendance: [
      // Same class as the absent row already here — must not overwrite it.
      { id: "f1", device_id: "9999", subject_id: "file-dsa", date: "2026-09-01", start_time: "08:00:00", end_time: "08:50:00", status: "present" as const },
      { id: "f2", device_id: "9999", subject_id: "file-dsa", date: "2026-09-02", start_time: "08:00:00", end_time: "08:50:00", status: "present" as const },
    ],
    marks: [
      // "FT-I" is the FT-1 already here, by match key — must not double it.
      { id: "fm1", device_id: "9999", subject_id: "file-dsa", component_type: "CT" as const, label: "FT-I", marks_obtained: 5, max_marks: 5, is_external: false },
      { id: "fm2", device_id: "9999", subject_id: "file-dsa", component_type: "CT" as const, label: "FT-2", marks_obtained: 12, max_marks: 15, is_external: false },
    ],
    portal_snapshots: [
      { id: "ps", device_id: "9999", subject_code: "21CSC201J", conducted: 40, absent: 6, percentage: 85, as_of: "2026-09-20" },
    ],
  };

  it("keeps classes already marked here and adds the rest", async () => {
    const res = await importData(PIN, file, { ...NONE, history: true });
    const byDate = Object.fromEntries(db.attendance.map((r) => [r.date, r.status]));
    expect(byDate).toEqual({ "2026-09-01": "absent", "2026-09-02": "present" });
    expect(res.attendance).toBe(1);
  });

  it("adds components this account doesn't have, and only those", async () => {
    const res = await importData(PIN, file, { ...NONE, history: true });
    expect(db.marks.map((m) => m.label).sort()).toEqual(["FT-1", "FT-2"]);
    expect(res.marks).toBe(1);
  });

  it("restores portal totals only where the file's are newer", async () => {
    db.portal_snapshots = [
      { id: "old", device_id: PIN, subject_code: "21CSC201J", conducted: 30, absent: 5, percentage: 83, as_of: "2026-09-10" },
    ];
    await importData(PIN, file, { ...NONE, history: true });
    expect(db.portal_snapshots).toHaveLength(1);
    expect(db.portal_snapshots[0]).toMatchObject({ conducted: 40, as_of: "2026-09-20" });

    db.portal_snapshots[0].as_of = "2026-09-25"; // this account is ahead now
    db.portal_snapshots[0].conducted = 45;
    await importData(PIN, file, { ...NONE, history: true });
    expect(db.portal_snapshots[0]).toMatchObject({ conducted: 45 });
  });

  it("skips archives with a name this account already has", async () => {
    const res = await importData(
      PIN,
      {
        archives: [
          { id: "a", device_id: "9999", label: "semester 2", sgpa: 9, credits: 22, summary: [], sem_start: null, sem_end: null },
          { id: "b", device_id: "9999", label: "Semester 1", sgpa: 8.1, credits: 21, summary: [], sem_start: null, sem_end: null },
        ],
      },
      { ...NONE, archives: true }
    );
    expect(res.archives).toBe(1);
    expect(db.semester_archives.map((a) => a.label).sort()).toEqual(["Semester 1", "Semester 2"]);
  });
});

describe("exportAllData", () => {
  it("includes past semesters and portal totals", async () => {
    db.portal_snapshots = [{ id: "p", device_id: PIN, subject_code: "21CSC201J", conducted: 40, absent: 6, percentage: 85, as_of: "2026-09-20" }];
    const out = await exportAllData(PIN);
    expect(out.archives).toHaveLength(1);
    expect(out.portal_snapshots).toHaveLength(1);
    expect(out.attendance).toHaveLength(1);
  });
});
