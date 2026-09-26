// Supabase Edge Function: portal-ingest
//
// Receives scraped attendance/marks from the portal-sync bookmarklet and
// writes them with the service role.
//
// Why this exists: the bookmarklet used to write straight to PostgREST
// with the anon key. Once RLS became owner-scoped, anon lost every
// policy and those writes started failing with 42501. The obvious fix —
// embed a Supabase refresh token in the bookmarklet — is worse than it
// looks: a bookmarklet's URL is visible in the browser's bookmark
// manager and syncs across devices, so that would put a full-account
// credential somewhere designed to be copied around.
//
// So the write moves here, and the bookmarklet carries a token that is
// good for one PIN only: HMAC-SHA256(INGEST_SECRET, pin), hex. The
// function recomputes it from the device_id in the body, so editing
// device_id in the request makes the token wrong. It used to carry the
// secret itself and trust whatever device_id came with it — anyone
// holding one bookmarklet could write into every PIN. The secret now
// stays in Supabase secrets and on the machine that builds bookmarklets.
//
// A token can submit portal data for its PIN and nothing else: it
// cannot read anything and cannot touch other tables.
//
// Deploy:  supabase functions deploy portal-ingest --no-verify-jwt
// Secrets: INGEST_SECRET (any long random string)
import { createClient } from "npm:@supabase/supabase-js@2";

interface Snapshot {
  subject_code: string;
  conducted: number;
  absent: number;
  percentage: number | null;
}

interface Mark {
  subject_code: string;
  label: string;
  max_marks: number;
  marks_obtained: number;
  component_type: string;
}

const cors = {
  // The bookmarklet runs on sp.srmist.edu.in, so this is genuinely
  // cross-origin. The token is what authorises, not the origin.
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-ingest-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

const enc = new TextEncoder();

/** 64 hex characters → the 32 bytes of an HMAC-SHA256, or null. */
function hexBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-f]{64}$/i.test(hex)) return null;
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/**
 * Whether `token` is HMAC-SHA256(secret, pin). `crypto.subtle.verify`
 * compares in constant time, which a `!==` on the strings does not.
 */
async function tokenValid(secret: string, pin: string, token: string | null): Promise<boolean> {
  const sig = token ? hexBytes(token.trim()) : null;
  if (!sig) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  return crypto.subtle.verify("HMAC", key, sig, enc.encode(pin));
}

const MAX_ATTENDANCE = 100;
const MAX_MARKS = 500;
const COMPONENT_TYPES = new Set(["CT", "Lab", "Assignment", "Project", "External"]);

const isCount = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0;
const isCode = (s: unknown): s is string =>
  typeof s === "string" && s.trim().length > 0 && s.trim().length <= 20;

/**
 * The first thing wrong with a payload, or null. A scraper that read a
 * page wrongly produces exactly these shapes — a negative count, absences
 * above what was held — and writing them would put a wrong baseline under
 * every attendance number in the app, so the request is refused whole.
 */
function problemWith(attendance: unknown[], marks: unknown[]): string | null {
  if (attendance.length > MAX_ATTENDANCE) return `more than ${MAX_ATTENDANCE} attendance rows`;
  if (marks.length > MAX_MARKS) return `more than ${MAX_MARKS} marks`;
  for (const [i, raw] of attendance.entries()) {
    const a = raw as Partial<Snapshot>;
    if (
      !isCode(a.subject_code) ||
      !isCount(a.conducted) ||
      !isCount(a.absent) ||
      a.absent > a.conducted ||
      !(a.percentage === null || a.percentage === undefined || (isCount(a.percentage) && a.percentage <= 100))
    ) {
      return `attendance row ${i + 1}`;
    }
  }
  for (const [i, raw] of marks.entries()) {
    const m = raw as Partial<Mark>;
    if (
      !isCode(m.subject_code) ||
      typeof m.label !== "string" ||
      !m.label.trim() ||
      m.label.length > 80 ||
      !isCount(m.marks_obtained) ||
      !isCount(m.max_marks) ||
      m.max_marks === 0 ||
      !COMPONENT_TYPES.has(String(m.component_type))
    ) {
      return `mark ${i + 1}`;
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const secret = Deno.env.get("INGEST_SECRET");
  if (!secret) return json({ error: "INGEST_SECRET not configured" }, 500);

  let payload: {
    device_id?: string;
    attendance?: Snapshot[];
    marks?: Mark[];
  };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "bad json" }, 400);
  }

  const pin = String(payload.device_id ?? "").trim();
  if (!/^\d{4}$/.test(pin)) return json({ error: "device_id must be 4 digits" }, 400);
  if (!(await tokenValid(secret, pin, req.headers.get("x-ingest-token")))) {
    return json({ error: "unauthorised" }, 401);
  }

  const attendance = Array.isArray(payload.attendance) ? payload.attendance : [];
  const marks = Array.isArray(payload.marks) ? payload.marks : [];
  const problem = problemWith(attendance, marks);
  if (problem) return json({ error: `rejected: bad ${problem}` }, 400);

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // The day in India, like every other date the app stores. A UTC date
  // lands on yesterday for anything synced before 5:30am.
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  let snapshots = 0;
  let marksAdded = 0;
  let marksUpdated = 0;

  // ---- attendance snapshots ----
  if (attendance.length) {
    const rows = attendance.map((a) => ({
      device_id: pin,
      subject_code: a.subject_code.trim(),
      conducted: a.conducted,
      absent: a.absent,
      percentage: a.percentage ?? null,
      as_of: today,
      synced_at: new Date().toISOString(),
    }));
    const { error } = await sb
      .from("portal_snapshots")
      .upsert(rows, { onConflict: "device_id,subject_code" });
    if (error) return json({ error: `attendance: ${error.message}` }, 500);
    snapshots = rows.length;
  }

  // ---- marks ----
  // Matched to subjects by code, and only rows this sync owns are
  // touched: a mark typed in by hand is never overwritten.
  if (marks.length) {
    const { data: subjects, error: subErr } = await sb
      .from("subjects")
      .select("id,code")
      .eq("device_id", pin);
    if (subErr) return json({ error: `subjects: ${subErr.message}` }, 500);

    const byCode = new Map<string, string>(
      (subjects ?? []).map((s) => [String(s.code).trim().toUpperCase(), s.id as string])
    );

    const { data: existing, error: exErr } = await sb
      .from("marks")
      .select("id,subject_id,label")
      .eq("device_id", pin)
      .eq("source", "portal");
    if (exErr) return json({ error: `marks: ${exErr.message}` }, 500);

    const seen = new Map<string, string>(
      (existing ?? []).map((m) => [`${m.subject_id}|${m.label}`, m.id as string])
    );

    const updates: Array<Record<string, unknown>> = [];
    const inserts: Array<Record<string, unknown>> = [];
    for (const m of marks) {
      const subjectId = byCode.get(m.subject_code.trim().toUpperCase());
      if (!subjectId) continue; // no matching subject in AcadKit — skip
      const row = {
        device_id: pin,
        subject_id: subjectId,
        component_type: m.component_type,
        label: m.label.trim(),
        marks_obtained: m.marks_obtained,
        max_marks: m.max_marks,
        is_external: false,
        source: "portal",
      };
      const id = seen.get(`${subjectId}|${row.label}`);
      if (id) updates.push({ id, ...row });
      else inserts.push(row);
    }

    // Two requests, not one per mark.
    if (updates.length) {
      const { error } = await sb.from("marks").upsert(updates, { onConflict: "id" });
      if (error) return json({ error: `marks: ${error.message}` }, 500);
      marksUpdated = updates.length;
    }
    if (inserts.length) {
      const { error } = await sb.from("marks").insert(inserts);
      if (error) return json({ error: `marks: ${error.message}` }, 500);
      marksAdded = inserts.length;
    }
  }

  return json({ snapshots, marksAdded, marksUpdated, as_of: today });
});
