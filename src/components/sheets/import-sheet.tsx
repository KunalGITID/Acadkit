import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ClipboardList, Clock3, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { importData, type AcadkitExport, type ImportOptions } from "@/api/queries";
import { useAppStore } from "@/store/app";
import { cn } from "@/lib/utils";

interface ImportSheetProps {
  data: AcadkitExport | null;
  onClose: () => void;
}

const ROWS: Array<{
  key: keyof ImportOptions;
  icon: typeof Clock3;
  label: string;
  count: (d: AcadkitExport) => number;
  note: string;
}> = [
  {
    key: "subjects",
    icon: Clock3,
    label: "Subjects & timetable",
    count: (d) => (d.timetable ?? []).length,
    note: "matches your subjects by code — attendance stays intact",
  },
  {
    key: "deadlines",
    icon: ClipboardList,
    label: "Deadlines",
    count: (d) => (d.deadlines ?? []).length,
    note: "replaces your current deadlines",
  },
  {
    key: "holidays",
    icon: CalendarDays,
    label: "Holidays & semester dates",
    count: (d) => (d.settings?.declared_holidays ?? []).length,
    note: "declared holidays + semester window",
  },
];

export function ImportSheet({ data, onClose }: ImportSheetProps) {
  const pin = useAppStore((s) => s.pin)!;
  const qc = useQueryClient();
  const [opts, setOpts] = useState<ImportOptions>({
    subjects: true,
    deadlines: false,
    holidays: false,
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data) setOpts({ subjects: true, deadlines: false, holidays: false });
  }, [data]);

  async function run() {
    if (!data) return;
    if (!opts.subjects && !opts.deadlines && !opts.holidays) {
      toast.error("Pick at least one thing to import");
      return;
    }
    setBusy(true);
    try {
      const res = await importData(pin, data, opts);
      await qc.invalidateQueries();
      toast.success("Imported", {
        description: [
          opts.subjects && `${res.slots} class slots`,
          opts.deadlines && `${res.deadlines} deadlines`,
          opts.holidays && "holidays",
        ]
          .filter(Boolean)
          .join(" · "),
      });
      onClose();
    } catch (err) {
      toast.error("Import failed", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  const valid = data && (data.acadkit_export === 1 || data.subjects || data.timetable);

  return (
    <Sheet
      open={data !== null}
      onOpenChange={(o) => !o && onClose()}
      title="Import data"
      description="Choose what to bring in. Selected categories are replaced; the rest is left as-is."
    >
      {!valid ? (
        <p className="py-6 text-center text-sm font-semibold text-bad-deep">
          This file doesn't look like an AcadKit export.
        </p>
      ) : (
        <div className="space-y-2.5">
          {ROWS.map((row) => {
            const active = opts[row.key];
            const n = data ? row.count(data) : 0;
            return (
              <button
                key={row.key}
                onClick={() => setOpts((o) => ({ ...o, [row.key]: !o[row.key] }))}
                className={cn(
                  "flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition-colors",
                  active ? "border-accent/40 bg-accent/8" : "bg-surface-2/40 hover:bg-surface-2/70"
                )}
              >
                <span
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                    active ? "bg-accent text-white" : "bg-surface text-muted"
                  )}
                >
                  <row.icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">
                    {row.label} <span className="text-muted">· {n}</span>
                  </p>
                  <p className="truncate text-xs text-muted">{row.note}</p>
                </div>
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2",
                    active ? "border-accent bg-accent text-white" : "border-ink/20"
                  )}
                >
                  {active && "✓"}
                </span>
              </button>
            );
          })}

          <Button size="lg" className="mt-2 h-12 w-full" onClick={run} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Import selected
          </Button>
        </div>
      )}
    </Sheet>
  );
}
