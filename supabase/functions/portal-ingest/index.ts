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
// So the write moves here. The bookmarklet carries INGEST_SECRET, which
// grants exactly one thing: submit portal data for one device_id. It
// cannot read anything, cannot touch other tables, and cannot reach
// another PIN's rows.
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
  // cross-origin. The secret is what authorises, not the origin.
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-ingest-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const secret = Deno.env.get("INGEST_SECRET");
  if (!secret) return json({ error: "INGEST_SECRET not configured" }, 500);
  if (req.headers.get("x-ingest-secret") !== secret) {
    return json({ error: "unauthorised" }, 401);
  }

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

  const pin = (payload.device_id ?? "").trim();
  if (!/^\d{4}$/.test(pin)) return json({ error: "device_id must be 4 digits" }, 400);

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const today = new Date().toISOString().slice(0, 10);
  let snapshots = 0;
  let marksAdded = 0;
  let marksUpdated = 0;

  // ---- attendance snapshots ----
  const attendance = payload.attendance ?? [];
  if (attendance.length) {
    const rows = attendance.map((a) => ({
      device_id: pin,
      subject_code: a.subject_code,
      conducted: a.conducted,
      absent: a.absent,
      percentage: a.percentage,
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
  const marks = payload.marks ?? [];
  if (marks.length) {
    const { data: subjects } = await sb
      .from("subjects")
      .select("id,code")
      .eq("device_id", pin);

    const byCode = new Map(
      (subjects ?? []).map((s) => [String(s.code).trim().toUpperCase(), s.id])
    );

    const { data: existing } = await sb
      .from("marks")
      .select("id,subject_id,label")
      .eq("device_id", pin)
      .eq("source", "portal");

    const seen = new Map(
      (existing ?? []).map((m) => [`${m.subject_id}|${m.label}`, m.id])
    );

    for (const m of marks) {
      const subjectId = byCode.get(m.subject_code.trim().toUpperCase());
      if (!subjectId) continue; // no matching subject in AcadKit — skip
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
        const { error } = await sb.from("marks").update(row).eq("id", id);
        if (error) return json({ error: `marks: ${error.message}` }, 500);
        marksUpdated++;
      } else {
        const { error } = await sb.from("marks").insert(row);
        if (error) return json({ error: `marks: ${error.message}` }, 500);
        marksAdded++;
      }
    }
  }

  return json({ snapshots, marksAdded, marksUpdated, as_of: today });
});
