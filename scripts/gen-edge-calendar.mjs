/** Generates the edge function's copy of the **official holidays** from src/data/semester.ts. */
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

function holidayLines(map) {
  return Object.entries(map)
    .map(([k, v]) => `  "${k}": ${JSON.stringify(v)},`)
    .join("\n");
}

const out = `// GENERATED FILE — DO NOT EDIT.
// Written by scripts/gen-edge-calendar.mjs from src/data/semester.ts.

export const OFFICIAL_HOLIDAYS: Record<string, string> = {
${holidayLines(sem.OFFICIAL_HOLIDAYS)}
};
`;

writeFileSync(OUT, out);
console.log(
  `Wrote ${OUT.replace(root + "/", "")}  ` +
    `(${Object.keys(sem.OFFICIAL_HOLIDAYS).length} holidays)`
);
