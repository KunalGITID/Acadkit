/**
 * How many people use AcadKit: `npm run stats`.
 *
 * Reads active_days (migration 039): one row per account per day it was
 * opened, nothing more. Prints weekly active users now, a daily count for
 * the last week, WAU for each of the last 8 weeks, how many use the
 * installed app, and new accounts per week.
 *
 * Needs VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local: the
 * app can write its own row but never read any, so this takes the service key.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Add VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to .env.local, then run this again.");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

/** Local calendar day, as the app records it. */
const iso = (d) => d.toLocaleDateString("en-CA");
const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return iso(d);
};

const since = daysAgo(8 * 7 - 1);
const { data: rows, error } = await supabase
  .from("active_days")
  .select("device_id, day, installed, release")
  .gte("day", since)
  .limit(100000);
if (error) {
  console.error(`Couldn't read active_days: ${error.message}`);
  process.exit(1);
}
const { data: owners } = await supabase.from("device_owners").select("claimed_at").gte("claimed_at", since);

/** Distinct accounts active from `from` to `to`, inclusive. */
const activeBetween = (from, to) => new Set(rows.filter((r) => r.day >= from && r.day <= to).map((r) => r.device_id));

const wau = activeBetween(daysAgo(6), daysAgo(0));
const lastWeek = activeBetween(daysAgo(13), daysAgo(7));
const installed = new Set(rows.filter((r) => r.installed && r.day >= daysAgo(6)).map((r) => r.device_id));

console.log(`Weekly active users: ${wau.size}` + (lastWeek.size ? `  (last week ${lastWeek.size})` : ""));
console.log(`Using the installed app: ${installed.size} of ${wau.size}\n`);

console.log("Last 7 days");
for (let n = 6; n >= 0; n--) {
  const day = daysAgo(n);
  const count = activeBetween(day, day).size;
  console.log(`  ${day}  ${String(count).padStart(3)}  ${"█".repeat(count)}`);
}

console.log("\nWeekly active users, last 8 weeks (week ending)");
for (let w = 7; w >= 0; w--) {
  const count = activeBetween(daysAgo(w * 7 + 6), daysAgo(w * 7)).size;
  const signups = (owners ?? []).filter((o) => {
    const day = iso(new Date(o.claimed_at));
    return day >= daysAgo(w * 7 + 6) && day <= daysAgo(w * 7);
  }).length;
  console.log(`  ${daysAgo(w * 7)}  ${String(count).padStart(3)}  ${"█".repeat(count)}${signups ? `  +${signups} new` : ""}`);
}
