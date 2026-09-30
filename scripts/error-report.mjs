/**
 * Crash reports from the app, grouped: `npm run errors [days]`.
 *
 * One line per distinct crash (error_log.fingerprint, migration 038), most
 * frequent first: how often, on how many devices, which releases, and when it
 * was first and last seen. A crash whose last release is older than the
 * current one has probably been fixed.
 *
 * Needs VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local: error
 * reports are write-only from the app, so reading them takes the service key.
 */
import { createClient } from "@supabase/supabase-js";

const days = Number(process.argv[2] ?? 30);
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Add VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to .env.local, then run this again.");
  process.exit(1);
}
if (!Number.isFinite(days) || days <= 0) {
  console.error("Usage: npm run errors [days]   (default 30)");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const since = new Date(Date.now() - days * 864e5).toISOString();

const { data, error } = await supabase
  .from("error_log")
  .select("fingerprint, message, release, device_id, component_stack, url, created_at")
  .gte("created_at", since)
  .order("created_at", { ascending: false })
  .limit(5000);
if (error) {
  console.error(`Couldn't read error_log: ${error.message}`);
  process.exit(1);
}

if (!data.length) {
  console.log(`No crashes in the last ${days} days.`);
  process.exit(0);
}

const groups = new Map();
for (const row of data) {
  const id = row.fingerprint ?? "unknown";
  const g = groups.get(id) ?? { id, n: 0, devices: new Set(), releases: new Set(), pages: new Set(), first: row.created_at, last: row.created_at, sample: row };
  g.n++;
  if (row.device_id) g.devices.add(row.device_id);
  g.releases.add(row.release ?? "before tags");
  if (row.url) g.pages.add(row.url);
  if (row.created_at < g.first) g.first = row.created_at;
  if (row.created_at > g.last) g.last = row.created_at;
  groups.set(id, g);
}

const day = (iso) => iso.slice(0, 10);
const where = (s) =>
  s === "unhandled rejection" || s === "uncaught error" ? s : "render (error screen)";

console.log(`${data.length} crash reports in the last ${days} days, ${groups.size} distinct:\n`);
for (const g of [...groups.values()].sort((a, b) => b.n - a.n)) {
  console.log(`● ${g.n}× on ${g.devices.size} device${g.devices.size === 1 ? "" : "s"}  [${g.id}]`);
  console.log(`  ${g.sample.message.replace(/\s+/g, " ").slice(0, 160)}`);
  console.log(`  ${where(g.sample.component_stack)} · ${[...g.pages].slice(0, 3).join(", ")}`);
  console.log(`  seen ${day(g.first)} → ${day(g.last)} · releases: ${[...g.releases].join(", ")}\n`);
}
