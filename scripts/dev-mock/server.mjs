/**
 * Offline preview backend.
 *
 *   npm run dev:mock
 *
 * Speaks just enough PostgREST for the app, seeded with a full semester of
 * fake data under PIN 1234, and starts Vite pointed at it. Nothing touches
 * the real Supabase project, so this is safe to poke at.
 *
 * Realtime isn't implemented — supabase-js will retry a websocket in the
 * background and the UI carries on without it.
 */
import { createServer } from "node:http";
import { spawn } from "node:child_process";

const PORT = 54321;
const PIN = "1234";
const SEM_START = "2026-07-21";
const SEM_END = "2026-11-18";

const uid = (p, n) => `${p}-${String(n).padStart(4, "0")}`;

const SUBJECTS = [
  ["21CSC201J", "Data Structures & Algorithms", 4, "theory", "#7c6af7"],
  ["21CSC202J", "Operating Systems", 4, "theory", "#f97316"],
  ["21DCS201P", "Design Thinking & Methodology", 3, "theory", "#22d3ee"],
  ["21MAB201T", "Transforms & Boundary Value Problems", 4, "theory", "#4ade80"],
  ["21CSS202T", "Fundamentals of Data Science", 5, "theory", "#f472b6"],
  ["21LEM201T", "Professional Ethics", 0, "theory", "#fb7185"],
].map(([code, name, credits, type, color_hex], i) => ({
  id: uid("sub", i),
  device_id: PIN,
  code,
  name,
  credits,
  type,
  faculty: "Dr. Placeholder",
  color_hex,
  internal_only: false,
  created_at: new Date().toISOString(),
}));

const TIMES = [
  ["08:00:00", "08:50:00"],
  ["08:50:00", "09:40:00"],
  ["10:00:00", "10:50:00"],
  ["11:00:00", "11:50:00"],
  ["12:00:00", "12:50:00"],
];

const TIMETABLE = [];
let slotN = 0;
for (let day = 1; day <= 5; day++) {
  for (let p = 0; p < TIMES.length; p++) {
    const s = SUBJECTS[(day + p) % SUBJECTS.length];
    TIMETABLE.push({
      id: uid("slot", slotN++),
      device_id: PIN,
      subject_id: s.id,
      day_order: day,
      start_time: TIMES[p][0],
      end_time: TIMES[p][1],
      room: `TP${300 + p}`,
      slot_type: "theory",
    });
  }
}

// Portal snapshot dated a week back, so the Attendance page shows the
// "portal totals as of …" badge and the layering path is exercised.
const AS_OF = (() => {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toLocaleDateString("en-CA");
})();

const SNAPSHOTS = [
  ["21CSC201J", 45, 5],
  ["21CSC202J", 42, 11],
  ["21DCS201P", 30, 2],
  ["21MAB201T", 40, 12],
].map(([subject_code, conducted, absent], i) => ({
  id: uid("snap", i),
  device_id: PIN,
  subject_code,
  conducted,
  absent,
  percentage: Number((((conducted - absent) / conducted) * 100).toFixed(2)),
  as_of: AS_OF,
  synced_at: new Date().toISOString(),
}));

// A few classes marked by hand since the snapshot, plus history for the
// two subjects the portal doesn't cover.
const ATTENDANCE = [];
let attN = 0;
for (let back = 6; back >= 1; back--) {
  const d = new Date();
  d.setDate(d.getDate() - back);
  const date = d.toLocaleDateString("en-CA");
  if ([0, 6].includes(d.getDay())) continue;
  SUBJECTS.slice(0, 4).forEach((s, i) => {
    ATTENDANCE.push({
      id: uid("att", attN++),
      device_id: PIN,
      subject_id: s.id,
      date,
      start_time: TIMES[i][0],
      end_time: TIMES[i][1],
      status: (back + i) % 5 === 0 ? "absent" : "present",
    });
  });
}
for (let back = 40; back >= 1; back--) {
  const d = new Date();
  d.setDate(d.getDate() - back);
  if ([0, 6].includes(d.getDay())) continue;
  const date = d.toLocaleDateString("en-CA");
  SUBJECTS.slice(4).forEach((s, i) => {
    ATTENDANCE.push({
      id: uid("att", attN++),
      device_id: PIN,
      subject_id: s.id,
      date,
      start_time: TIMES[i][0],
      end_time: TIMES[i][1],
      status: back % 7 === 0 ? "absent" : "present",
    });
  });
}

const MARKS = [];
let markN = 0;
SUBJECTS.forEach((s, i) => {
  if (s.credits === 0) return;
  MARKS.push({
    id: uid("mark", markN++),
    device_id: PIN,
    subject_id: s.id,
    component_type: "CT",
    label: "CT1",
    marks_obtained: 34 + ((i * 3) % 14),
    max_marks: 50,
    is_external: false,
    source: i % 2 === 0 ? "portal" : "manual",
    added_at: new Date().toISOString(),
  });
  MARKS.push({
    id: uid("mark", markN++),
    device_id: PIN,
    subject_id: s.id,
    component_type: "Assignment",
    label: "Assignment 1",
    marks_obtained: 8 + (i % 3),
    max_marks: 10,
    is_external: false,
    source: "manual",
    added_at: new Date().toISOString(),
  });
});

const DEVICE_OWNERS = [
  {
    device_id: PIN,
    user_id: "00000000-0000-4000-8000-000000000000",
    claimed_at: new Date().toISOString(),
  },
];

const db = {
  device_owners: DEVICE_OWNERS,
  settings: [
    {
      id: uid("set", 0),
      device_id: PIN,
      name: "Kunal",
      semester: 3,
      target_sgpa: 8.5,
      min_attendance: 75,
      sem_start: SEM_START,
      sem_end: SEM_END,
      declared_holidays: [],
      current_day_order: 1,
      // Migration 018. Null is the interesting case: it means this
      // account has never picked a theme, so the app publishes whatever
      // the device is already using rather than being reset by a default.
      theme: null,
      theme_mode: null,
    },
  ],
  subjects: SUBJECTS,
  timetable_slots: TIMETABLE,
  attendance: ATTENDANCE,
  marks: MARKS,
  deadlines: [
    {
      id: uid("dl", 0),
      device_id: PIN,
      subject_id: SUBJECTS[0].id,
      title: "DSA Lab Record",
      type: "lab",
      due_date: new Date(Date.now() + 3 * 864e5).toISOString(),
      status: "pending",
      priority: "high",
    },
    {
      id: uid("dl", 1),
      device_id: PIN,
      subject_id: SUBJECTS[3].id,
      title: "Unit Test 2",
      type: "exam",
      due_date: new Date(Date.now() + 9 * 864e5).toISOString(),
      status: "pending",
      priority: "medium",
    },
  ],
  portal_snapshots: SNAPSHOTS,
  semester_archives: [],
  push_subscriptions: [],
};

let seq = 1000;

/** Apply PostgREST-style `col=eq.value` / `in.(…)` filters. */
function filter(rows, params) {
  for (const [k, v] of params) {
    if (["select", "order", "limit", "offset", "on_conflict"].includes(k)) continue;
    const eq = v.match(/^eq\.(.*)$/);
    if (eq) {
      rows = rows.filter((r) => String(r[k]) === eq[1]);
      continue;
    }
    const inn = v.match(/^in\.\((.*)\)$/);
    if (inn) {
      const set = inn[1].split(",").map((s) => s.replace(/^"|"$/g, ""));
      rows = rows.filter((r) => set.includes(String(r[k])));
    }
  }
  return rows;
}

const server = createServer((req, res) => {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-headers", "*");
  res.setHeader("access-control-allow-methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("access-control-expose-headers", "content-range");
  if (req.method === "OPTIONS") return res.writeHead(204).end();

  const u = new URL(req.url, "http://x");

  // ---- auth ----
  // The app gates on a Supabase session now, so the mock has to hand one
  // out or the preview never gets past the sign-in screen. It accepts
  // any credentials on purpose: this server exists to exercise the UI
  // offline, and asking for a real password to look at a mock semester
  // would defeat the point. Nothing here is a security boundary — it
  // listens on localhost and serves fabricated data.
  if (u.pathname.startsWith("/auth/v1/")) {
    const session = {
      access_token: "mock-access-token",
      refresh_token: "mock-refresh-token",
      token_type: "bearer",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: {
        id: "00000000-0000-4000-8000-000000000000",
        aud: "authenticated",
        role: "authenticated",
        email: "you@localhost.mock",
        app_metadata: {},
        user_metadata: {},
        created_at: new Date().toISOString(),
      },
    };
    res.writeHead(200, { "content-type": "application/json" });
    // /logout returns no body; everything else gets the session.
    return res.end(u.pathname.includes("logout") ? "" : JSON.stringify(session));
  }

  const table = u.pathname.replace(/^\/rest\/v1\//, "");
  if (!(table in db)) {
    res.writeHead(404, { "content-type": "application/json" });
    return res.end(JSON.stringify({ message: `relation "${table}" does not exist` }));
  }

  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const json = body ? JSON.parse(body) : null;
    // maybeSingle()/single() ask for one object rather than an array.
    const single = (req.headers.accept || "").includes("pgrst.object");
    const reply = (code, data) => {
      res.writeHead(code, { "content-type": "application/json" });
      res.end(data === undefined ? "" : JSON.stringify(data));
    };

    if (req.method === "GET") {
      let rows = filter(db[table], u.searchParams);
      const order = u.searchParams.get("order");
      if (order) {
        const [col, dir] = order.split(".");
        rows = [...rows].sort((a, b) =>
          String(a[col]) < String(b[col]) ? -1 : String(a[col]) > String(b[col]) ? 1 : 0
        );
        if (dir === "desc") rows.reverse();
      }
      return reply(200, single ? rows[0] ?? null : rows);
    }

    if (req.method === "POST") {
      const rows = Array.isArray(json) ? json : [json];
      const conflict = (u.searchParams.get("on_conflict") || "").split(",").filter(Boolean);
      const out = [];
      for (const row of rows) {
        const hit = conflict.length
          ? db[table].find((r) => conflict.every((c) => r[c] === row[c]))
          : null;
        if (hit) Object.assign(hit, row), out.push(hit);
        else {
          const fresh = { id: uid(table.slice(0, 3), ++seq), ...row };
          db[table].push(fresh);
          out.push(fresh);
        }
      }
      return reply(201, single ? out[0] ?? null : out);
    }

    if (req.method === "PATCH") {
      const rows = filter(db[table], u.searchParams);
      rows.forEach((r) => Object.assign(r, json));
      return reply(200, single ? rows[0] ?? null : rows);
    }

    if (req.method === "DELETE") {
      const doomed = new Set(filter(db[table], u.searchParams));
      db[table] = db[table].filter((r) => !doomed.has(r));
      return reply(200, []);
    }
    reply(405, { message: "not implemented in the mock" });
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`\n  mock Supabase  →  http://127.0.0.1:${PORT}`);
  console.log(`  seeded PIN     →  ${PIN}  (enter this on the onboarding screen)`);
  console.log(`  portal snapshot as of ${AS_OF} on 4 of 6 subjects\n`);

  const vite = spawn("npx", ["vite"], {
    stdio: "inherit",
    env: {
      ...process.env,
      VITE_SUPABASE_URL: `http://127.0.0.1:${PORT}`,
      VITE_SUPABASE_ANON_KEY: "mock-anon-key",
    },
  });
  const bye = () => {
    vite.kill();
    server.close();
    process.exit(0);
  };
  process.on("SIGINT", bye);
  process.on("SIGTERM", bye);
  vite.on("exit", bye);
});
