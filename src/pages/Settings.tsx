import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  CalendarX2,
  Check,
  Copy,
  Download,
  Loader2,
  Monitor,
  Moon,
  Pencil,
  Plus,
  RefreshCw,
  Sun,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Dot } from "@/components/ui/misc";
import { SubjectSheet } from "@/components/sheets/subject-sheet";
import {
  accountExists,
  clearTimetable,
  deleteAllData,
  ensureSettings,
  exportAllData,
  updateSettings as apiUpdateSettings,
} from "@/api/queries";
import { useSettings, useSubjects } from "@/hooks/useData";
import { isValidPin } from "@/lib/pin";
import { useAppStore, type ThemePref } from "@/store/app";
import type { Subject } from "@/types";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-1 text-xs font-bold uppercase tracking-widest text-muted">{children}</p>
  );
}

function ProfileCard() {
  const pin = useAppStore((s) => s.pin)!;
  const localName = useAppStore((s) => s.name);
  const setName = useAppStore((s) => s.setName);
  const { data: settings } = useSettings();
  const [input, setInput] = useState(settings?.name ?? localName);
  const [saved, setSaved] = useState(false);

  // Adopt the cloud name once it loads, unless the user already typed
  useEffect(() => {
    if (settings?.name && input === "") setInput(settings.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.name]);

  function save() {
    const name = input.trim();
    setName(name);
    // Best-effort cloud copy so the name follows the PIN (needs migration 007)
    void apiUpdateSettings(pin, { name }).catch(() => {});
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    toast.success(name ? `Hi, ${name}!` : "Name cleared");
  }

  return (
    <section className="card space-y-3 p-5">
      <div>
        <p className="font-bold">Your name</p>
        <p className="mt-0.5 text-xs text-muted">
          Used for the dashboard greeting — "Good morning, {input.trim() || "you"}".
        </p>
      </div>
      <div className="flex gap-2.5">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. Kunal"
          maxLength={30}
        />
        <Button onClick={save} className="h-12 shrink-0">
          {saved ? <Check className="h-4 w-4" /> : null}
          {saved ? "Saved" : "Save"}
        </Button>
      </div>
    </section>
  );
}

function PinCard() {
  const pin = useAppStore((s) => s.pin)!;
  const [copied, setCopied] = useState(false);

  return (
    <section className="card overflow-hidden">
      <div className="bg-gradient-to-br from-[hsl(var(--accent)/0.12)] to-[hsl(var(--accent-2)/0.10)] p-6 text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-muted">Your sync PIN</p>
        <div className="mt-3 flex justify-center gap-2.5">
          {pin.split("").map((digit, i) => (
            <motion.span
              key={i}
              initial={{ opacity: 0, y: 12, rotateX: 60 }}
              animate={{ opacity: 1, y: 0, rotateX: 0 }}
              transition={{ delay: i * 0.07, type: "spring", stiffness: 260, damping: 20 }}
              className="flex h-14 w-12 items-center justify-center rounded-2xl border bg-surface font-mono text-2xl font-bold shadow-card"
            >
              {digit}
            </motion.span>
          ))}
        </div>
        <p className="mx-auto mt-4 max-w-xs text-xs text-muted">
          Enter this PIN on any phone or laptop and your entire AcadKit follows you there.
        </p>
        <Button
          variant="secondary"
          size="sm"
          className="mt-4"
          onClick={() => {
            void navigator.clipboard.writeText(pin);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
            toast.success("PIN copied");
          }}
        >
          {copied ? <Check className="h-4 w-4 text-good-deep" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied" : "Copy PIN"}
        </Button>
      </div>
    </section>
  );
}

function SyncCard() {
  const setPin = useAppStore((s) => s.setPin);
  const qc = useQueryClient();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function sync() {
    if (!isValidPin(input)) {
      toast.error("PINs are exactly 4 digits");
      return;
    }
    setBusy(true);
    try {
      if (await accountExists(input)) {
        await ensureSettings(input);
        setPin(input);
        qc.clear();
        toast.success(`Switched to PIN ${input} — data loaded`);
        setInput("");
      } else {
        toast.error(`No data found for PIN ${input}`);
      }
    } catch (err) {
      toast.error("Couldn't reach the server", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card space-y-3 p-5">
      <div>
        <p className="font-bold">Sync this device to another PIN</p>
        <p className="mt-0.5 text-xs text-muted">
          Replaces what this device shows with that PIN's data. Nothing is deleted.
        </p>
      </div>
      <div className="flex gap-2.5">
        <Input
          inputMode="numeric"
          maxLength={4}
          placeholder="••••"
          value={input}
          onChange={(e) => setInput(e.target.value.replace(/\D/g, "").slice(0, 4))}
          className="text-center font-mono text-lg tracking-[0.5em]"
        />
        <Button onClick={sync} disabled={busy || !isValidPin(input)} className="h-12 shrink-0">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Sync
        </Button>
      </div>
    </section>
  );
}

function SubjectsCard() {
  const { data: subjects } = useSubjects();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Subject | null>(null);

  return (
    <section className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="font-bold">Subjects</p>
          <p className="mt-0.5 text-xs text-muted">
            {(subjects ?? []).length} subjects ·{" "}
            {(subjects ?? []).reduce((s, x) => s + x.credits, 0)} credits
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setEditing(null);
            setSheetOpen(true);
          }}
        >
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>
      <div className="space-y-1.5">
        {(subjects ?? []).map((s) => (
          <button
            key={s.id}
            onClick={() => {
              setEditing(s);
              setSheetOpen(true);
            }}
            className="group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-surface-2/70"
          >
            <Dot color={s.color_hex} />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{s.name}</span>
            <span className="text-xs font-medium text-muted">
              {s.credits === 0 ? "audit" : `${s.credits} cr`}
            </span>
            <Pencil className="h-3.5 w-3.5 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        ))}
      </div>
      <SubjectSheet open={sheetOpen} onClose={() => setSheetOpen(false)} subject={editing} />
    </section>
  );
}

function DataCard() {
  const pin = useAppStore((s) => s.pin)!;
  const resetPin = useAppStore((s) => s.resetPin);
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

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
        onClick={() => {
          if (!window.confirm("Clear all timetable slots? Attendance history is kept.")) return;
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
        onClick={() => {
          if (
            !window.confirm(
              `Permanently delete ALL data for PIN ${pin} — subjects, attendance, marks, deadlines, settings? This cannot be undone.`
            )
          )
            return;
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

export default function Settings() {
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="px-1 text-2xl font-extrabold tracking-tight lg:text-3xl">Settings</h1>

      <div className="space-y-3">
        <SectionTitle>Profile</SectionTitle>
        <ProfileCard />
      </div>

      <div className="space-y-3">
        <SectionTitle>Cross-device sync</SectionTitle>
        <PinCard />
        <SyncCard />
      </div>

      <div className="space-y-3">
        <SectionTitle>Appearance</SectionTitle>
        <section className="card p-5">
          <Segmented<ThemePref>
            layoutId="theme"
            options={[
              { value: "light", label: "Light" },
              { value: "system", label: "System" },
              { value: "dark", label: "Dark" },
            ]}
            value={theme}
            onChange={setTheme}
          />
          <p className="mt-3 flex items-center justify-center gap-4 text-xs text-muted">
            <span className="flex items-center gap-1"><Sun className="h-3.5 w-3.5" /> paper</span>
            <span className="flex items-center gap-1"><Monitor className="h-3.5 w-3.5" /> auto</span>
            <span className="flex items-center gap-1"><Moon className="h-3.5 w-3.5" /> ink</span>
          </p>
        </section>
      </div>

      <div className="space-y-3">
        <SectionTitle>Academics</SectionTitle>
        <SubjectsCard />
      </div>

      <div className="space-y-3">
        <SectionTitle>Data management</SectionTitle>
        <DataCard />
      </div>

      <p className="pb-4 pt-2 text-center text-xs text-muted">
        AcadKit 2.0 — built for SRM KTR's day-order life. Internals /60, externals /40, 75% or bust.
      </p>
    </div>
  );
}
