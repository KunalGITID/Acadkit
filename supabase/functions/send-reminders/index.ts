// Supabase Edge Function: send-reminders
//
// Invoked on a schedule (see supabase/functions/send-reminders/cron.sql).
// Computes per-device reminders from the day-order calendar + timetable
// and sends Web Push. Dedupes via the sent_notifications table.
//
// Deploy:  supabase functions deploy send-reminders --no-verify-jwt
// Secrets: VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT, CRON_SECRET
//          (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are provided by the platform)
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

// --- semester calendar (keep in sync with src/data/semester.ts) ---
const SEMESTER_START = "2026-07-21";
const SEMESTER_END = "2026-11-18";
const OFFICIAL_HOLIDAYS: Record<string, string> = {
  "2026-08-26": "Milad-un-Nabi",
  "2026-09-04": "Krishna Jayanthi",
  "2026-09-14": "Vinayakar Chathurthi",
  "2026-10-02": "Gandhi Jayanthi",
  "2026-10-19": "Ayutha Pooja",
  "2026-10-20": "Vijaya Dasami",
  "2026-11-08": "Deepavali",
};
const DAY_ORDER_MAP: Record<string, number> = {
  "2026-07-21": 1, "2026-07-22": 2, "2026-07-23": 3, "2026-07-24": 4, "2026-07-27": 5,
  "2026-07-28": 1, "2026-07-29": 2, "2026-07-30": 3, "2026-07-31": 4, "2026-08-03": 5,
  "2026-08-04": 1, "2026-08-05": 2, "2026-08-06": 3, "2026-08-07": 4, "2026-08-10": 5,
  "2026-08-11": 1, "2026-08-12": 2, "2026-08-13": 3, "2026-08-14": 4, "2026-08-17": 5,
  "2026-08-18": 1, "2026-08-19": 2, "2026-08-20": 3, "2026-08-21": 4, "2026-08-24": 5,
  "2026-08-25": 1, "2026-08-27": 2, "2026-08-28": 3, "2026-08-31": 4, "2026-09-01": 5,
  "2026-09-02": 1, "2026-09-03": 2, "2026-09-07": 3, "2026-09-08": 4, "2026-09-09": 5,
  "2026-09-10": 1, "2026-09-11": 2, "2026-09-15": 3, "2026-09-16": 4, "2026-09-17": 5,
  "2026-09-18": 1, "2026-09-21": 2, "2026-09-22": 3, "2026-09-23": 4, "2026-09-24": 5,
  "2026-09-25": 1, "2026-09-28": 2, "2026-09-29": 3, "2026-09-30": 4, "2026-10-01": 5,
  "2026-10-05": 1, "2026-10-06": 2, "2026-10-07": 3, "2026-10-08": 4, "2026-10-09": 5,
  "2026-10-12": 1, "2026-10-13": 2, "2026-10-14": 3, "2026-10-15": 4, "2026-10-16": 5,
  "2026-10-21": 1, "2026-10-22": 2, "2026-10-23": 3, "2026-10-26": 4, "2026-10-27": 5,
  "2026-10-28": 1, "2026-10-29": 2, "2026-10-30": 3, "2026-11-02": 4, "2026-11-03": 5,
  "2026-11-04": 1, "2026-11-05": 2, "2026-11-06": 3, "2026-11-09": 4, "2026-11-10": 5,
  "2026-11-11": 1, "2026-11-12": 2, "2026-11-13": 3, "2026-11-16": 4, "2026-11-17": 5,
  "2026-11-18": 1,
};
const CANONICAL = Object.keys(DAY_ORDER_MAP).sort();

function effectiveMap(declared: string[]): Record<string, number> {
  if (!declared.length) return DAY_ORDER_MAP;
  const set = new Set(declared);
  const orders = CANONICAL.map((d) => DAY_ORDER_MAP[d]);
  const working = CANONICAL.filter((d) => !set.has(d));
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
  const deviceIds = [...new Set((subs ?? []).map((s) => s.device_id))];
  if (deviceIds.length === 0) return new Response(JSON.stringify({ sent: 0 }));

  const inSemester = date >= SEMESTER_START && date <= SEMESTER_END;

  for (const pin of deviceIds) {
    const [{ data: settings }, { data: subjects }, { data: timetable }, { data: attendance }, { data: deadlines }] =
      await Promise.all([
        sb.from("settings").select("declared_holidays").eq("device_id", pin).maybeSingle(),
        sb.from("subjects").select("id,name").eq("device_id", pin),
        sb.from("timetable_slots").select("*").eq("device_id", pin),
        sb.from("attendance").select("subject_id,date,start_time,status").eq("device_id", pin),
        sb.from("deadlines").select("id,title,due_date,status").eq("device_id", pin),
      ]);

    const subjName = new Map((subjects ?? []).map((s) => [s.id, s.name]));
    const declared = ((settings?.declared_holidays ?? []) as Array<{ date: string }>).map((h) => h.date);
    const dayOrder = inSemester && !OFFICIAL_HOLIDAYS[date] ? effectiveMap(declared)[date] : undefined;
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
          title: `${subjName.get(slot.subject_id) ?? "Class"} in ${lead} min`,
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
          title: "Mark today's attendance",
          body: `${unmarked} class${unmarked > 1 ? "es" : ""} still unmarked from today.`,
          url: "/",
        });
      }
    }

    // 3) Deadlines due within 24h (morning sweep at 08:00)
    if (ist.getHours() === 8) {
      const now = Date.now();
      for (const d of deadlines ?? []) {
        if (d.status !== "pending") continue;
        const due = new Date(d.due_date).getTime();
        const hrs = (due - now) / 3_600_000;
        if (hrs > 0 && hrs <= 24) {
          msgs.push({
            device_id: pin,
            kind: "deadline",
            ref: `${d.id}|${date}`,
            title: `Due soon: ${d.title}`,
            body: "Deadline within 24 hours.",
            url: "/",
          });
        }
      }
    }

    // 4) Low-attendance alert (once/day at 08:00)
    if (ist.getHours() === 8) {
      const bySub = new Map<string, { p: number; t: number }>();
      for (const a of attendance ?? []) {
        if (a.status !== "present" && a.status !== "absent") continue;
        const e = bySub.get(a.subject_id) ?? { p: 0, t: 0 };
        if (a.status === "present") e.p++;
        e.t++;
        bySub.set(a.subject_id, e);
      }
      for (const [sid, { p, t }] of bySub) {
        if (t >= 4 && p / t < 0.75) {
          msgs.push({
            device_id: pin,
            kind: "low_attendance",
            ref: `low|${sid}|${date}`,
            title: `${subjName.get(sid) ?? "A subject"} below 75%`,
            body: `You're at ${Math.round((p / t) * 100)}% — attend the next few to recover.`,
            url: "/attendance",
          });
        }
      }
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
