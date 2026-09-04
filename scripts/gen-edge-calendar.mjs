/**
 * Generates the edge function's copy of the **official holidays** from
 * src/data/semester.ts.
 *
 *   node scripts/gen-edge-calendar.mjs
 *
 * The Deno function can't import from src/, so the values are emitted as
 * a checked-in .ts file. Run this after editing the holiday list and
 * redeploy; `npm run test` fails if the two ever drift.
 *
 * The day-order map is deliberately NOT emitted any more. It used to be,
 * and that was the bug: a build-time snapshot of the semester window,
 * while the app reads that window live from each device's settings row.
 * The moment the dates were edited in the app the two disagreed. The
 * function now generates its own map from the settings it already
 * fetches. Only the holidays are shared, because those really are fixed.
 */
import { build } from "esbuild";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const OUT = resolve(root, "supabase/functions/send-reminders/calendar.generated.ts");

// esbuild the TS source to ESM so its values can just be imported.
const tmp = mkdtempSync(join(tmpdir(), "acadkit-cal-"));
const bundle = join(tmp, "semester.mjs");
await build({
  entryPoints: [resolve(root, "src/data/semester.ts")],
  outfile: bundle,
  bundle: true,
  format: "esm",
  platform: "neutral",
});

const sem = await import(pathToFileURL(bundle).href);
rmSync(tmp, { recursive: true, force: true });

/** Five date→day-order pairs per line, matching semester.ts's shape. */
function mapLines(map) {
  const entries = Object.entries(map);
  const lines = [];
  for (let i = 0; i < entries.length; i += 5) {
    lines.push(
      "  " +
        entries
          .slice(i, i + 5)
          .map(([k, v]) => `"${k}": ${v},`)
          .join(" ")
    );
  }
  return lines.join("\n");
}

function holidayLines(map) {
  return Object.entries(map)
    .map(([k, v]) => `  "${k}": ${JSON.stringify(v)},`)
    .join("\n");
}

const out = `// GENERATED FILE — DO NOT EDIT.
//
// Written by scripts/gen-edge-calendar.mjs from src/data/semester.ts.
// Edit the holidays there and re-run:
//
//   node scripts/gen-edge-calendar.mjs
//
// Only the official holiday list lives here. The day-order map is
// generated inside the function from each device's own sem_start/sem_end,
// because a baked map drifts the moment those dates are edited in the app.

export const OFFICIAL_HOLIDAYS: Record<string, string> = {
${holidayLines(sem.OFFICIAL_HOLIDAYS)}
};
`;

writeFileSync(OUT, out);
console.log(
  `Wrote ${OUT.replace(root + "/", "")}  ` +
    `(${Object.keys(sem.OFFICIAL_HOLIDAYS).length} holidays)`
);
