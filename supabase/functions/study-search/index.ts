// Supabase Edge Function: study-search
//
// Search the study folder by meaning. Two jobs, one model:
//
//   { texts: string[] }                 → { vectors }  embeddings, for the sync script
//   { query, device_id, limit? }        → { results }  nearest passages, for the app
//
// Both use gte-small, the embedding model built into the edge runtime —
// no API key, no per-call cost, and the passages and the query are
// embedded by the same model, which is what makes their vectors
// comparable.
//
// Embedding is for the service role only (the sync script's key). A
// search runs as the signed-in user, so match_study_chunks is subject to
// RLS: nobody can search a PIN they don't own.
//
// Deploy:  supabase functions deploy study-search
//          (JWT verification stays on: every caller carries a JWT)
import { createClient } from "npm:@supabase/supabase-js@2";

const session = new Supabase.ai.Session("gte-small");

/** Enough for a sync batch; the function has a CPU budget per request. */
const MAX_TEXTS = 32;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

/**
 * The role claimed by the caller's JWT. The gateway has already verified
 * the signature (verify_jwt), so reading the claim is enough.
 */
function roleOf(auth: string | null): string | null {
  const part = (auth ?? "").replace(/^Bearer\s+/i, "").split(".")[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "=")));
    return typeof claims.role === "string" ? claims.role : null;
  } catch {
    return null;
  }
}

async function embed(text: string): Promise<number[]> {
  const out = await session.run(text, { mean_pool: true, normalize: true });
  return Array.from(out as ArrayLike<number>);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: { texts?: unknown; query?: unknown; device_id?: unknown; limit?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad json" }, 400);
  }
  const auth = req.headers.get("Authorization");

  if (Array.isArray(body.texts)) {
    if (roleOf(auth) !== "service_role") return json({ error: "forbidden" }, 403);
    const texts = body.texts.slice(0, MAX_TEXTS).map((t) => String(t).slice(0, 4000));
    const vectors: number[][] = [];
    for (const t of texts) vectors.push(await embed(t));
    return json({ vectors });
  }

  const query = String(body.query ?? "").trim().slice(0, 500);
  const pin = String(body.device_id ?? "");
  if (!query) return json({ error: "empty query" }, 400);
  if (!/^\d{4}$/.test(pin)) return json({ error: "device_id must be 4 digits" }, 400);
  const limit = Math.min(Math.max(Number(body.limit) || 12, 1), 30);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth ?? "" } },
    auth: { persistSession: false },
  });
  const vector = await embed(query);
  const { data, error } = await sb.rpc("match_study_chunks", {
    p_device: pin,
    query_embedding: vector,
    match_count: limit,
  });
  if (error) return json({ error: error.message }, 500);
  return json({ results: data ?? [] });
});
