import { useEffect, useMemo, useState } from "react";
import { TrendingUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { AnimatedNumber } from "@/components/viz/animated-number";

/**
 * Semester-by-semester CGPA, kept local to the device.
 *
 * Lifted out of the Marks page's calculator strip when grade projection
 * was consolidated onto Insights. The other two calculators there —
 * "what do I need" and the target-SGPA table — were superseded by the
 * per-subject budget cards, which answer the same questions against a
 * real assessment plan instead of a fixed 60/40. This one had no
 * equivalent, so it moved rather than being retired.
 *
 * Deliberately not in Supabase: past semesters aren't part of the PIN's
 * academic record, and `semester_archives` (migration 010) already
 * covers the ones AcadKit actually watched happen.
 */

interface CgpaRow {
  sgpa: string;
  credits: string;
}

const CGPA_KEY = "acadkit:cgpa";

function loadCgpaRows(): CgpaRow[] {
  try {
    const raw = JSON.parse(localStorage.getItem(CGPA_KEY) ?? "[]") as CgpaRow[];
    if (Array.isArray(raw) && raw.length === 8) return raw;
  } catch {
    /* fresh */
  }
  return Array.from({ length: 8 }, () => ({ sgpa: "", credits: "" }));
}

export function CgpaCard() {
  const [rows, setRows] = useState<CgpaRow[]>(loadCgpaRows);

  useEffect(() => {
    localStorage.setItem(CGPA_KEY, JSON.stringify(rows));
  }, [rows]);

  const { cgpa, semesters } = useMemo(() => {
    let weighted = 0;
    let credits = 0;
    let count = 0;
    for (const r of rows) {
      const s = Number(r.sgpa);
      const c = Number(r.credits);
      if (r.sgpa !== "" && r.credits !== "" && s >= 0 && s <= 10 && c > 0) {
        weighted += s * c;
        credits += c;
        count++;
      }
    }
    return { cgpa: credits > 0 ? weighted / credits : null, semesters: count };
  }, [rows]);

  function update(i: number, key: keyof CgpaRow, value: string) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));
  }

  return (
    <section className="card space-y-4 p-5">
      <p className="flex items-center gap-2 font-bold">
        <TrendingUp className="h-4 w-4 text-accent" /> CGPA
      </p>

      <div className="flex items-center justify-between rounded-2xl border bg-surface-2/40 px-4 py-3">
        {cgpa === null ? (
          <p className="text-sm font-semibold text-muted">
            Enter SGPA and credits per semester
          </p>
        ) : (
          <>
            <p className="text-3xl font-extrabold tabular accent-gradient-text">
              <AnimatedNumber value={cgpa} decimals={2} />
            </p>
            <p className="text-xs font-semibold text-muted">
              across {semesters} semester{semesters === 1 ? "" : "s"}
            </p>
          </>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="grid grid-cols-[2.5rem_1fr_1fr] gap-2 px-1 text-[10px] font-bold uppercase tracking-widest text-muted">
          <span>Sem</span>
          <span>SGPA</span>
          <span>Credits</span>
        </div>
        {rows.map((row, i) => (
          <div key={i} className="grid grid-cols-[2.5rem_1fr_1fr] items-center gap-2">
            <span className="text-center text-sm font-bold text-muted">{i + 1}</span>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              max={10}
              step={0.01}
              placeholder="—"
              value={row.sgpa}
              onChange={(e) => update(i, "sgpa", e.target.value)}
              className="h-10 rounded-xl text-center text-sm"
            />
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              placeholder="—"
              value={row.credits}
              onChange={(e) => update(i, "credits", e.target.value)}
              className="h-10 rounded-xl text-center text-sm"
            />
          </div>
        ))}
      </div>
    </section>
  );
}
