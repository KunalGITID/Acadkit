// Supabase Edge Function: send-reminders
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

// --- semester calendar ---
import { OFFICIAL_HOLIDAYS } from "./calendar.generated.ts";

const DEFAULT_START = "2026-07-21";
const DEFAULT_END = "2026-11-18";

function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function isWeekend(iso: string): boolean {
  const day = new Date(iso + "T00:00:00Z").getUTCDay();
  return day === 0 || day === 6;
}

/** Day Order 1–5 across every weekday in the window that isn't a holiday. */
function generateDayOrderMap(start: string, end: string): Record<string, number> {
  const map: Record<string, number> = {};
  let order = 1;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (isWeekend(d) || OFFICIAL_HOLIDAYS[d]) continue;
    map[d] = order;
    order = (order % 5) + 1;
  }
  return map;
}

/** Declared holidays drop out and shift the remaining orders forward. */
function effectiveMap(
  declared: string[],
  start: string,
  end: string
): Record<string, number> {
  const canonical = generateDayOrderMap(start, end);
  if (!declared.length) return canonical;
  const set = new Set(declared);
  const dates = Object.keys(canonical);
  const orders = dates.map((d) => canonical[d]);
  const working = dates.filter((d) => !set.has(d));
  const map: Record<string, number> = {};
  working.forEach((d, i) => (map[d] = orders[i]));
  return map;
}

// --- IST clock (the app is single-region: SRM KTR) ---
function istNow() {
  const now = new Date();
  const ist = new Date(now.getTime() + (330 + now.getTimezoneOffset()) * 60_000);
  const date = `${ist.getFullYear()}-${String(ist.getMonth() + 1).padStart(2, "0")}-${String(ist.getDate()).padStart(2, "0")}`;
  return { ist, date, minutes: ist.getHours() * 60 + ist.getMinutes() };
}
const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const fmt = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  const p = h >= 12 ? "PM" : "AM";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, "0")} ${p}`;
};

/** Titles that mean the end-sem, as labelMatchKey leaves them (see EXTERNAL_ALIASES in src/lib/plan.ts). */
const END_SEM_TITLES = new Set([
  "endsem", "endsems", "endsemester", "endsemexam", "endsemesterexam", "endsemesterexamination",
  "finalexam", "final", "semexam", "semesterexam", "external", "theoryexam", "text", "ext", "theoryext", "theoryexternal",
]);

interface Msg {
  device_id: string;
  kind: string;
  ref: string;
  title: string;
  body: string;
  url: string;
}

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) {
    return new Response("forbidden", { status: 403 });
  }

  webpush.setVapidDetails(
    Deno.env.get("VAPID_SUBJECT") || "mailto:acadkit@example.com",
    Deno.env.get("VAPID_PUBLIC")!,
    Deno.env.get("VAPID_PRIVATE")!
  );

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { ist, date, minutes } = istNow();
  const msgs: Msg[] = [];

  // Only the devices that actually subscribed
  const { data: subs } = await sb.from("push_subscriptions").select("*");
  const deviceIds: string[] = [...new Set((subs ?? []).map((s) => s.device_id as string))];
  if (deviceIds.length === 0) return new Response(JSON.stringify({ sent: 0 }));

  for (const pin of deviceIds) {
    const [{ data: settings }, { data: subjects }, { data: timetable }, { data: attendance }, { data: deadlines }, { data: snapshots }] =
      await Promise.all([
        sb.from("settings").select("declared_holidays,sem_start,sem_end,theme").eq("device_id", pin).maybeSingle(),
        sb.from("subjects").select("id,name,code,short_name,medical_leave").eq("device_id", pin),
        sb.from("timetable_slots").select("*").eq("device_id", pin),
        sb.from("attendance").select("subject_id,date,start_time,status").eq("device_id", pin),
        sb.from("deadlines").select("id,title,type,subject_id,due_date,status").eq("device_id", pin),
        sb.from("portal_snapshots").select("subject_code,conducted,absent,as_of").eq("device_id", pin),
      ]);

    const subjName = new Map((subjects ?? []).map((s) => [s.id, s.name]));

    /** Notifications speak the same register as the app. */
    const brutal = settings?.theme === "brutalist";
    const pickCopy = <T,>(plain: T, brut: T): T => (brutal ? brut : plain);

    /** What a deadline is called, matching deadlineLabel in src/lib/deadlines.ts. */
    const DEADLINE_TYPE_LABEL: Record<string, string> = {
      assignment: "Assignment",
      exam: "Exam",
      lab: "Lab",
      other: "Other",
    };
    const subjShort = new Map(
      (subjects ?? []).map((s) => [s.id, (s.short_name as string | null)?.trim() || null])
    );
    /**
     * "Data Structures & Algorithms lab due", or just "Lab due" when the
     * deadline was never assigned a subject - naming the type twice
     * ("Lab lab due") is the trap here.
     */
    const deadlineHeadline = (d: { type: string; subject_id: string | null }) => {
      const type = DEADLINE_TYPE_LABEL[d.type] ?? "Deadline";
      const name = (subjName.get(d.subject_id ?? "") as string | undefined)?.trim();
      if (!name) return `${type} due`;
      const label = subjShort.get(d.subject_id ?? "") || name;
      return `${label} ${type.toLowerCase()} due`;
    };

    /** Attendance per subject, matching computeSubjectAttendance in src/lib/attendance.ts. */
    const snapByCode = new Map(
      (snapshots ?? []).map((s) => [String(s.subject_code).trim().toUpperCase(), s])
    );
    // Mirrors isCounted / isAttended in src/lib/attendance.ts.
    const counted = (status: string) => status !== "holiday";
    const attendedStatus = (status: string) => status === "present" || status === "od";
    function heldFor(subjectId: string, code: string | null) {
      const rows = (attendance ?? []).filter(
        (a) => a.subject_id === subjectId && counted(a.status)
      );
      const snap = code ? snapByCode.get(code.trim().toUpperCase()) : undefined;
      if (snap && Number(snap.conducted) > 0) {
        const since = rows.filter((a) => a.date > snap.as_of);
        return {
          attended:
            Number(snap.conducted) - Number(snap.absent) +
            since.filter((a) => attendedStatus(a.status)).length,
          total: Number(snap.conducted) + since.length,
        };
      }
      return {
        attended: rows.filter((a) => attendedStatus(a.status)).length,
        total: rows.length,
      };
    }
    /** The bar each subject is held to, matching minAttendanceFor in src/lib/attendance.ts: 65% where medical leave is granted, else 75%. */
    const barById = new Map<string, number>(
      (subjects ?? []).map((s) => [s.id as string, s.medical_leave ? 65 : 75])
    );
    const declared = ((settings?.declared_holidays ?? []) as Array<{ date: string }>).map((h) => h.date);
    // Per device, exactly as the app reads it. The window has to be read
    // before anything asks whether today is inside it.
    const semStart = (settings?.sem_start as string | null) || DEFAULT_START;
    const semEnd = (settings?.sem_end as string | null) || DEFAULT_END;
    const inSemester = date >= semStart && date <= semEnd;
    const dayOrder = inSemester && !OFFICIAL_HOLIDAYS[date] ? effectiveMap(declared, semStart, semEnd)[date] : undefined;
    const todaySlots = (timetable ?? []).filter((s) => s.day_order === dayOrder);

    // 1) Class starting in the next ~15 min
    for (const slot of todaySlots) {
      const start = toMin(slot.start_time.slice(0, 5));
      const lead = start - minutes;
      if (lead > 0 && lead <= 15) {
        msgs.push({
          device_id: pin,
          kind: "class",
          ref: `${slot.id}|${date}`,
          title: pickCopy(
            `${subjName.get(slot.subject_id) ?? "Class"} in ${lead} min`,
            `${subjName.get(slot.subject_id) ?? "class"} in ${lead} min. run.`
          ),
          body: `${fmt(slot.start_time.slice(0, 5))}${slot.room ? ` · ${slot.room}` : ""} · Day Order ${dayOrder}`,
          url: "/",
        });
      }
    }

    // 2) Evening nudge to mark today's attendance (18:00–18:59)
    if (dayOrder && todaySlots.length && ist.getHours() === 18) {
      const marked = new Set(
        (attendance ?? [])
          .filter((a) => a.date === date)
          .map((a) => `${a.subject_id}|${a.start_time.slice(0, 5)}`)
      );
      const unmarked = todaySlots.filter(
        (s) => !marked.has(`${s.subject_id}|${s.start_time.slice(0, 5)}`)
      ).length;
      if (unmarked > 0) {
        msgs.push({
          device_id: pin,
          kind: "mark",
          ref: `mark|${date}`,
          title: pickCopy("Mark today's attendance", "mark today. or don't. it'll show."),
          body: pickCopy(
            `${unmarked} class${unmarked > 1 ? "es" : ""} still unmarked from today.`,
            `${unmarked} class${unmarked > 1 ? "es" : ""} unaccounted for.`
          ),
          url: "/attendance",
        });
      }
    }

    // 3) Deadlines due within 24h (morning sweep at 08:00)
    if (ist.getHours() === 8) {
      const now = Date.now();
      for (const d of deadlines ?? []) {
        if (d.status !== "pending") continue;
        // End-sem papers aren't deadlines (isEndSemDeadline in
        // src/lib/deadlines.ts, kept in step by hand): named like one,
        // or an exam after the last teaching day.
        const key = String(d.title ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
        const istDay = new Date(new Date(d.due_date).getTime() + 330 * 60_000).toISOString().slice(0, 10);
        if (END_SEM_TITLES.has(key) || (d.type === "exam" && istDay > semEnd)) continue;
        const due = new Date(d.due_date).getTime();
        const hrs = (due - now) / 3_600_000;
        if (hrs > 0 && hrs <= 24) {
          msgs.push({
            device_id: pin,
            kind: "deadline",
            ref: `${d.id}|${date}`,
            title: deadlineHeadline(d),
            // "within 24 hours" is the window that selected this row, not
            // news. The hour is the part you act on.
            body: pickCopy(
              hrs <= 12 ? "Due today." : "Due tomorrow.",
              hrs <= 12 ? "due today. good luck." : "due tomorrow. start now."
            ),
            url: "/calendar",
          });
        }
      }
    }

    // 4) Low-attendance alert (once/day at 08:00), against each subject's
    //    own bar - a subject on medical leave at 70% is not below it.
    if (ist.getHours() === 8) {
      for (const subject of subjects ?? []) {
        const { attended, total } = heldFor(subject.id, subject.code as string | null);
        const bar = barById.get(subject.id) ?? 75;
        if (total >= 4 && 100 * attended < bar * total) {
          msgs.push({
            device_id: pin,
            kind: "low_attendance",
            ref: `low|${subject.id}|${date}`,
            title: pickCopy(
              `${subject.name ?? "A subject"} below ${bar}%`,
              `${subject.name ?? "a subject"} is cooked`
            ),
            body: pickCopy(
              `You're at ${Math.round((attended / total) * 100)}% — attend the next few to recover.`,
              `${Math.round((attended / total) * 100)}%. attend the next few or it's gone.`
            ),
            url: "/attendance",
          });
        }
      }
    }

    // 4) The Mac has gone quiet (once/day at 20:00).
    if (ist.getHours() === 20) {
      const { data: hb } = await sb.storage.from("study-files").download(`${pin}/heartbeat.json`);
      let at: number | undefined;
      try {
        at = hb ? (JSON.parse(await hb.text()) as { at?: number }).at : undefined;
      } catch {
        at = undefined;
      }
      if (typeof at === "number" && Date.now() - at > 24 * 60 * 60_000) {
        const days = Math.floor((Date.now() - at) / (24 * 60 * 60_000));
        msgs.push({
          device_id: pin,
          kind: "mac_quiet",
          ref: `mac|${date}`,
          title: pickCopy("Your Mac hasn't synced in a while", "your mac ghosted your study folder"),
          body: pickCopy(
            `Last check-in ${days === 1 ? "a day" : `${days} days`} ago. Open it so your files, deletes and uploads catch up.`,
            `${days === 1 ? "a day" : `${days} days`} of silence. open the laptop.`
          ),
          url: "/files",
        });
      }
    }

    // 5) Morning verdict (08:00): can today actually be skipped?
    if (ist.getHours() === 8 && dayOrder && todaySlots.length) {
      const eff = effectiveMap(declared, semStart, semEnd);
      const remaining = new Map<string, number>();
      for (const [d, order] of Object.entries(eff)) {
        if (d < date || d > semEnd) continue;
        for (const slot of timetable ?? []) {
          if (slot.day_order !== order) continue;
          remaining.set(slot.subject_id, (remaining.get(slot.subject_id) ?? 0) + 1);
        }
      }

      const codeById = new Map(
        (subjects ?? []).map((s) => [s.id, (s.code as string | null) ?? null])
      );

      const spent = new Map<string, number>();
      const mustAttend: string[] = [];
      let firstBar = 75;
      for (const slot of todaySlots) {
        const { attended: p, total: t } = heldFor(
          slot.subject_id,
          codeById.get(slot.subject_id) ?? null
        );
        const rem = remaining.get(slot.subject_id) ?? 0;
        const bar = barById.get(slot.subject_id) ?? 75;
        const budget = Math.floor((100 * (p + rem) - bar * (t + rem)) / 100);
        const used = (spent.get(slot.subject_id) ?? 0) + 1;
        spent.set(slot.subject_id, used);
        if (budget - used < 0) {
          const name = subjName.get(slot.subject_id) ?? "A subject";
          if (!mustAttend.length) firstBar = bar;
          if (!mustAttend.includes(name)) mustAttend.push(name);
        }
      }

      msgs.push(
        mustAttend.length
          ? {
              device_id: pin,
              kind: "verdict",
              ref: `verdict|${date}`,
              title: pickCopy(
                `Attend today — ${mustAttend[0]} can't afford it`,
                `go in today. ${mustAttend[0]} can't take the hit.`
              ),
              body: pickCopy(
                mustAttend.length > 1
                  ? `${mustAttend.length} subjects today are out of skip budget.`
                  : `Missing today drops you below ${firstBar}%.`,
                mustAttend.length > 1
                  ? `${mustAttend.length} subjects today are broke.`
                  : "miss today and you're under."
              ),
              url: "/",
            }
          : {
              device_id: pin,
              kind: "verdict",
              ref: `verdict|${date}`,
              title: pickCopy(
                `Safe to skip today's ${todaySlots.length} class${todaySlots.length > 1 ? "es" : ""}`,
                `today's ${todaySlots.length} class${todaySlots.length > 1 ? "es are" : " is"} skippable`
              ),
              body: pickCopy(
                "Every subject today still has skip budget left.",
                "every subject still has budget. go touch grass."
              ),
              url: "/",
            }
      );
    }
  }

  // Dedupe + send
  let sent = 0;
  const subsByDevice = new Map<string, typeof subs>();
  for (const s of subs ?? []) {
    const arr = subsByDevice.get(s.device_id) ?? [];
    arr.push(s);
    subsByDevice.set(s.device_id, arr);
  }

  for (const m of msgs) {
    const { error: dupe } = await sb
      .from("sent_notifications")
      .insert({ device_id: m.device_id, kind: m.kind, ref: m.ref });
    if (dupe) continue; // unique violation → already sent

    const payload = JSON.stringify({ title: m.title, body: m.body, url: m.url, tag: m.kind });
    for (const sub of subsByDevice.get(m.device_id) ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
        sent++;
      } catch (err) {
        // 404/410 = subscription gone; clean it up
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await sb.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        }
      }
    }
  }

  return new Response(JSON.stringify({ candidates: msgs.length, sent }), {
    headers: { "content-type": "application/json" },
  });
});
