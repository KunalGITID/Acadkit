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

// --- semester calendar ---
//
// The day-order map is generated per device from that device's own
// sem_start/sem_end, mirroring generateDayOrderMap in src/lib/calendar.ts.
//
// It used to import a static map baked from src/data/semester.ts. That
// map is a build-time snapshot, while the app reads the semester window
// live from the settings row — so the moment those dates were edited in
// the app, the two disagreed. They already had: settings said the term
// ran to 20 Nov, the baked map stopped at the 18th, and the scheduler
// was silently blind on the last two class days of the semester. Only
// the holiday list stays static, since it is genuinely fixed.
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

  const inSemester = date >= semStart && date <= semEnd;

  for (const pin of deviceIds) {
    const [{ data: settings }, { data: subjects }, { data: timetable }, { data: attendance }, { data: deadlines }] =
      await Promise.all([
        sb.from("settings").select("declared_holidays,sem_start,sem_end").eq("device_id", pin).maybeSingle(),
        sb.from("subjects").select("id,name").eq("device_id", pin),
        sb.from("timetable_slots").select("*").eq("device_id", pin),
        sb.from("attendance").select("subject_id,date,start_time,status").eq("device_id", pin),
        sb.from("deadlines").select("id,title,due_date,status").eq("device_id", pin),
      ]);

    const subjName = new Map((subjects ?? []).map((s) => [s.id, s.name]));
    const declared = ((settings?.declared_holidays ?? []) as Array<{ date: string }>).map((h) => h.date);
    // Per device, exactly as the app reads it.
    const semStart = (settings?.sem_start as string | null) || DEFAULT_START;
    const semEnd = (settings?.sem_end as string | null) || DEFAULT_END;
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

    // 5) Morning verdict (08:00): can today actually be skipped?
    //
    // Mirrors src/lib/skipAdvice.ts — a subject's skip budget is how
    // many future classes it can still miss and finish at or above 75%:
    //   attended + remaining - k >= 0.75 * (held + remaining)
    // Today's repeats of one subject spend the budget cumulatively, so
    // the day is walked rather than each class judged on its own.
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

      const held = new Map<string, { p: number; t: number }>();
      for (const a of attendance ?? []) {
        if (a.status !== "present" && a.status !== "absent") continue;
        const e = held.get(a.subject_id) ?? { p: 0, t: 0 };
        if (a.status === "present") e.p++;
        e.t++;
        held.set(a.subject_id, e);
      }

      const spent = new Map<string, number>();
      const mustAttend: string[] = [];
      for (const slot of todaySlots) {
        const { p = 0, t = 0 } = held.get(slot.subject_id) ?? {};
        const rem = remaining.get(slot.subject_id) ?? 0;
        const budget = Math.floor(p + rem - 0.75 * (t + rem));
        const used = (spent.get(slot.subject_id) ?? 0) + 1;
        spent.set(slot.subject_id, used);
        if (budget - used < 0) {
          const name = subjName.get(slot.subject_id) ?? "A subject";
          if (!mustAttend.includes(name)) mustAttend.push(name);
        }
      }

      msgs.push(
        mustAttend.length
          ? {
              device_id: pin,
              kind: "verdict",
              ref: `verdict|${date}`,
              title: `Attend today — ${mustAttend[0]} can't afford it`,
              body:
                mustAttend.length > 1
                  ? `${mustAttend.length} subjects today are out of skip budget.`
                  : "Missing today drops you below 75%.",
              url: "/",
            }
          : {
              device_id: pin,
              kind: "verdict",
              ref: `verdict|${date}`,
              title: `Safe to skip today's ${todaySlots.length} class${todaySlots.length > 1 ? "es" : ""}`,
              body: "Every subject today still has skip budget left.",
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
