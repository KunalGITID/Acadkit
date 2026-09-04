import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/store/app";
import { type AcadkitExport } from "@/api/queries";
import { CalendarPlus, CalendarX2, Download, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ImportSheet } from "@/components/sheets/import-sheet";
import { useDialog } from "@/components/ui/dialog";
import {
  clearTimetable,
  deleteAllData,
  exportAllData,
  fetchSettings,
  fetchSubjects,
  fetchTimetable,
} from "@/api/queries";
import { buildEffectiveMap, semesterWindow } from "@/lib/calendar";
import { buildIcs, countEvents } from "@/lib/ics";

export function DataCard() {
  const { confirm } = useDialog();
  const pin = useAppStore((s) => s.pin)!;
  const resetPin = useAppStore((s) => s.resetPin);
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<AcadkitExport | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function run(name: string, fn: () => Promise<void>) {
    setBusy(name);
    try {
      await fn();
    } catch (err) {
      toast.error("Something went wrong", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(null);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as AcadkitExport;
      setPendingImport(parsed);
    } catch {
      toast.error("Couldn't read that file — is it valid JSON?");
    }
  }

  return (
    <section className="card space-y-2.5 p-5">
      <p className="font-bold">Data</p>

      <Button
        variant="secondary"
        className="w-full justify-start"
        disabled={busy !== null}
        onClick={() =>
          run("export", async () => {
            const data = await exportAllData(pin);
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `acadkit-export-${pin}-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
            toast.success("Export downloaded");
          })
        }
      >
        {busy === "export" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        Export everything as JSON
      </Button>

      <Button
        variant="secondary"
        className="w-full justify-start"
        disabled={busy !== null}
        onClick={() =>
          run("ics", async () => {
            const [subjects, timetable, settings] = await Promise.all([
              fetchSubjects(pin),
              fetchTimetable(pin),
              fetchSettings(pin),
            ]);
            if (!timetable.length) {
              toast.error("Add a timetable first");
              return;
            }
            const window = semesterWindow(settings);
            const effMap = buildEffectiveMap(settings?.declared_holidays ?? [], window);
            // Only what's ahead: nobody wants past classes replayed
            // into their calendar.
            const ics = buildIcs({
              subjects,
              timetable,
              effMap,
              from: new Date().toISOString().slice(0, 10),
            });
            const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `acadkit-timetable-${pin}.ics`;
            a.click();
            URL.revokeObjectURL(url);
            toast.success(`${countEvents(ics)} classes exported`);
          })
        }
      >
        {busy === "ics" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <CalendarPlus className="h-4 w-4" />
        )}
        Add timetable to my calendar
      </Button>

      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={onFile}
      />
      <Button
        variant="secondary"
        className="w-full justify-start"
        disabled={busy !== null}
        onClick={() => fileInput.current?.click()}
      >
        <Upload className="h-4 w-4" />
        Import from a file
      </Button>

      <ImportSheet data={pendingImport} onClose={() => setPendingImport(null)} />

      <Button
        variant="secondary"
        className="w-full justify-start"
        disabled={busy !== null}
        onClick={async () => {
          const ok = await confirm({
            title: "Clear the timetable?",
            body: "Every class slot goes. Attendance history is kept.",
            confirmLabel: "Clear schedule",
            destructive: true,
          });
          if (!ok) return;
          void run("schedule", async () => {
            await clearTimetable(pin);
            void qc.invalidateQueries({ queryKey: ["timetable", pin] });
            toast.success("Schedule cleared");
          });
        }}
      >
        {busy === "schedule" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarX2 className="h-4 w-4" />}
        Clear schedule only
      </Button>

      <Button
        variant="danger"
        className="w-full justify-start"
        disabled={busy !== null}
        onClick={async () => {
          const ok = await confirm({
            title: "Delete everything?",
            body: `Subjects, attendance, marks, deadlines and settings for PIN ${pin}. This cannot be undone.`,
            confirmLabel: "Delete it all",
            destructive: true,
          });
          if (!ok) return;
          void run("reset", async () => {
            await deleteAllData(pin);
            qc.clear();
            resetPin();
            toast.success("Everything wiped — fresh start");
          });
        }}
      >
        {busy === "reset" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        Reset all data
      </Button>
    </section>
  );
}