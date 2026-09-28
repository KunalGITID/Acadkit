import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GradeBadge } from "@/components/viz/grade-badge";
import { insertArchive } from "@/api/queries";
import { usePin } from "@/hooks/useData";
import { ATTENDANCE_BANDS, parseTranscript, sgpaOf, transcriptArchive } from "@/lib/pastRecord";
import type { Grade } from "@/lib/grades";

/** A semester from before AcadKit, from the transcript: paste the portal's grade table (or type "code name credits grade" per line), check what was read, save. */
export function PastSemesterSheet({
  open,
  onClose,
  suggestedLabel,
}: {
  open: boolean;
  onClose: () => void;
  suggestedLabel: string;
}) {
  const pin = usePin();
  const qc = useQueryClient();
  const [label, setLabel] = useState(suggestedLabel);
  const [ended, setEnded] = useState(""); // yyyy-mm
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const parsed = useMemo(() => parseTranscript(text), [text]);
  const { sgpa, credits } = useMemo(() => sgpaOf(parsed.rows), [parsed]);

  async function save() {
    setBusy(true);
    try {
      // The last day of the month it ended, so History sorts it among the others.
      const [y, m] = ended.split("-").map(Number);
      const archived_at = y && m ? new Date(Date.UTC(y, m, 0, 12)).toISOString() : undefined;
      await insertArchive(pin, { ...transcriptArchive(label.trim() || suggestedLabel, parsed.rows), archived_at });
      await qc.invalidateQueries({ queryKey: ["archives", pin] });
      toast.success(`${label.trim() || suggestedLabel} added`);
      setText("");
      onClose();
    } catch (err) {
      toast.error("Couldn't save it", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Add a past semester"
      description="From your transcript. Only grades and credits are kept."
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="text-xs font-semibold text-muted">Name</span>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={suggestedLabel} />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold text-muted">Ended</span>
            <Input type="month" value={ended} onChange={(e) => setEnded(e.target.value)} />
          </label>
        </div>
        <label className="block space-y-1">
          <span className="text-xs font-semibold text-muted">
            Paste the grade table, or one course per line: code, name, credits, grade, and the grade card's ATT code (H, 9,
            8, L) if you have it. Put * after a grade to mark it.
          </span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder={"21MAB101T  Calculus and Linear Algebra  4  A*\n21CSS101J  Programming for Problem Solving  4  A+"}
            className="w-full rounded-2xl border bg-surface-2/40 px-3 py-2 font-mono text-base leading-snug outline-none focus:border-accent sm:text-xs"
          />
        </label>

        {parsed.rows.length > 0 && (
          <div className="space-y-1.5">
            {parsed.rows.map((r) => (
              <div key={r.code} className="flex items-center gap-3 rounded-xl bg-surface-2/40 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{r.name}</span>
                  <span className="block text-[11px] font-medium text-muted">
                    {r.code} · {r.credits} credit{r.credits === 1 ? "" : "s"}
                    {r.credits === 0 && " (not counted)"}
                    {r.band && ` · attendance ${ATTENDANCE_BANDS[r.band]}`}
                  </span>
                </span>
                <span className="flex items-center gap-0.5">
                  <GradeBadge grade={r.grade as Grade} />
                  {r.starred && <span className="text-sm font-extrabold text-ink">*</span>}
                </span>
              </div>
            ))}
            <p className="px-1 text-sm font-semibold">
              SGPA <span className="tabular text-accent">{sgpa === null ? "—" : sgpa.toFixed(3)}</span>
              <span className="text-xs font-medium text-muted"> over {credits} credits</span>
            </p>
          </div>
        )}
        {parsed.skipped.length > 0 && (
          <p className="text-xs font-medium text-bad-deep">
            Couldn't read {parsed.skipped.length} line{parsed.skipped.length === 1 ? "" : "s"}: {parsed.skipped.slice(0, 3).join(" · ")}
          </p>
        )}

        <Button className="w-full" onClick={save} disabled={busy || parsed.rows.length === 0 || sgpa === null}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Save {parsed.rows.length > 0 ? `${parsed.rows.length} courses` : ""}
        </Button>
      </div>
    </Sheet>
  );
}
