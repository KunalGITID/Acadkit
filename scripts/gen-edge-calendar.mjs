/**
 * Generates the edge function's copy of the academic calendar from
 * src/data/semester.ts, which is the single source of truth.
 *
 *   node scripts/gen-edge-calendar.mjs
 *
 * The Deno function can't import from src/, so the values are emitted as
 * a checked-in .ts file. Run this after editing semester.ts for a new
 * semester and redeploy; `npm run test` fails if the two ever drift.
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
// Edit the semester there and re-run:
//
//   node scripts/gen-edge-calendar.mjs
//
// A duplicated calendar that silently drifts sends reminders on the
// wrong days, so semester.ts owns these values and this file mirrors them.

export const SEMESTER_START = ${JSON.stringify(sem.SEMESTER_START)};
export const SEMESTER_END = ${JSON.stringify(sem.SEMESTER_END)};

export const OFFICIAL_HOLIDAYS: Record<string, string> = {
${holidayLines(sem.OFFICIAL_HOLIDAYS)}
};

export const DAY_ORDER_MAP: Record<string, number> = {
${mapLines(sem.DAY_ORDER_MAP)}
};
`;

writeFileSync(OUT, out);
console.log(
  `Wrote ${OUT.replace(root + "/", "")}  ` +
    `(${Object.keys(sem.DAY_ORDER_MAP).length} day orders, ` +
    `${Object.keys(sem.OFFICIAL_HOLIDAYS).length} holidays)`
);
