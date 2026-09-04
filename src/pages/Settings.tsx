import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  CalendarRange,
  CalendarX2,
  Check,
  Contrast,
  Zap,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  Bell,
  BellOff,
  Monitor,
  Moon,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  Wand2,
  CalendarPlus,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Dot } from "@/components/ui/misc";
import { SubjectSheet } from "@/components/sheets/subject-sheet";
import { ImportSheet } from "@/components/sheets/import-sheet";
import { usePush } from "@/hooks/usePush";
import { useSession } from "@/hooks/useSession";
import { signOut } from "@/lib/auth";
import {
  PENDING_MIGRATIONS_SQL,
  accountExists,
  clearTimetable,
  deleteAllData,
  ensureSettings,
  exportAllData,
  fetchSettings,
  fetchSubjects,
  fetchTimetable,
  missingMigrations,
  sqlEditorUrl,
  type AcadkitExport,
  updateSettings as apiUpdateSettings,
} from "@/api/queries";
import {
  useAttendance,
  useAutoMark,
  useClearAutoMarks,
  useSettings,
  useSubjects,
  useUpdateSettings,
} from "@/hooks/useData";
import { buildEffectiveMap, semesterWindow } from "@/lib/calendar";
import { isValidPin } from "@/lib/pin";
import { describePending } from "@/lib/autoMark";
import { buildIcs, countEvents } from "@/lib/ics";
import { usePendingAutoMarks } from "@/hooks/useAutoMark";
import { cn, haptic } from "@/lib/utils";
import { useAppStore, type ColorMode, type ThemeName } from "@/store/app";
import type { Subject } from "@/types";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-1 text-xs font-bold uppercase tracking-widest text-muted">{children}</p>
  );
}

function SetupCard() {
  const qc = useQueryClient();
  const [checking, setChecking] = useState(false);
  const [copied, setCopied] = useState(false);
  const { data: missing } = useQuery({
    queryKey: ["migrations"],
    queryFn: missingMigrations,
    staleTime: Infinity,
  });

  if (!missing || missing.length === 0) return null;

  async function recheck() {
    setChecking(true);
    const still = await qc.fetchQuery({ queryKey: ["migrations"], queryFn: missingMigrations });
    setChecking(false);
    if (still.length === 0) {
      toast.success("All set — every feature is enabled! 🎉");
      // Pick up the now-saveable fields everywhere
      void qc.invalidateQueries();
    } else {
      toast.error("Not yet — paste the SQL and hit Run, then re-check.");
    }
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="card space-y-3 border-accent/30 bg-gradient-to-br from-[hsl(var(--accent)/0.08)] to-transparent p-5"
    >
      <div>
        <p className="flex items-center gap-2 font-bold">
          <Sparkles className="h-4 w-4 text-accent" /> Finish setup — 30 seconds, one paste
        </p>
        <p className="mt-1 text-xs text-muted">
          One SQL snippet unlocks: {missing.join(" · ")}. Copy it, open your project's SQL
          editor, paste, press <span className="font-bold">Run</span>, then re-check here.
        </p>
      </div>

      <pre className="overflow-x-auto rounded-2xl border bg-surface-2/60 p-3 font-mono text-[10.5px] leading-relaxed text-muted scrollbar-none">
        {PENDING_MIGRATIONS_SQL}
      </pre>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Button
          variant="primary"
          size="sm"
          className="h-10"
          onClick={() => {
            void navigator.clipboard.writeText(PENDING_MIGRATIONS_SQL);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
            toast.success("SQL copied — paste it in the editor");
          }}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          Copy SQL
        </Button>
        <a
          href={sqlEditorUrl()}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-surface-2 px-3.5 text-[13px] font-semibold text-ink transition-colors hover:bg-surface-2/70"
        >
          <ExternalLink className="h-4 w-4" /> Open SQL editor
        </a>
        <Button variant="outline" size="sm" className="h-10" onClick={recheck} disabled={checking}>
          {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          I ran it — re-check
        </Button>
      </div>
    </motion.section>
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

function SemesterDatesCard() {
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const defaults = useMemo(
    () => semesterWindow(settings),
    [settings?.sem_start, settings?.sem_end]
  );
  const [start, setStart] = useState(defaults.start);
  const [end, setEnd] = useState(defaults.end);
  const [saved, setSaved] = useState(false);

  // Adopt the loaded/cloud values once, unless the user is mid-edit
  useEffect(() => {
    setStart(defaults.start);
    setEnd(defaults.end);
  }, [defaults.start, defaults.end]);

  const dirty = start !== defaults.start || end !== defaults.end;
  const invalid = !start || !end || start >= end;

  function save() {
    if (invalid) {
      toast.error("Start date must be before the end date");
      return;
    }
    updateSettings.mutate({ sem_start: start, sem_end: end });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    toast.success("Semester dates updated — day orders recalculated everywhere");
  }

  return (
    <section className="card space-y-3 p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-accent/12 text-accent">
          <CalendarRange className="h-5 w-5" />
        </span>
        <div>
          <p className="font-bold">Semester dates</p>
          <p className="mt-0.5 text-xs text-muted">
            Drives the Day Order rotation across the whole app. Update these whenever the
            semester plan changes.
          </p>
        </div>
      </div>
      {/* iOS renders date fields natively and won't shrink them below
          their intrinsic width, so two across overflow and overlap on a
          phone. Side by side only once there's room. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Classes start">
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="Semester ends">
          <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </Field>
      </div>
      <Button onClick={save} disabled={!dirty || invalid} className="w-full">
        {saved ? <Check className="h-4 w-4" /> : null}
        {saved ? "Saved" : "Save semester dates"}
      </Button>
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

function NotificationsCard() {
  const { supported, subscribed, busy, permission, enable, disable } = usePush();

  return (
    <section className="card space-y-3 p-5">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl",
            subscribed ? "bg-accent/12 text-accent" : "bg-surface-2 text-muted"
          )}
        >
          {subscribed ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">Reminders</p>
          <p className="mt-0.5 text-xs text-muted">
            Class starting soon, deadlines due, a nudge to mark attendance, and low-attendance
            alerts.
          </p>
        </div>
      </div>

      {!supported ? (
        <p className="rounded-2xl bg-surface-2/60 p-3 text-xs font-semibold text-muted">
          This browser can't do push notifications. On iPhone, install AcadKit to your home
          screen first (Share → Add to Home Screen), then enable it from there.
        </p>
      ) : permission === "denied" ? (
        <p className="rounded-2xl bg-bad/10 p-3 text-xs font-semibold text-bad-deep">
          Notifications are blocked in your browser settings — allow them for this site, then try
          again.
        </p>
      ) : (
        <Button
          variant={subscribed ? "secondary" : "primary"}
          className="w-full"
          disabled={busy}
          onClick={subscribed ? disable : enable}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : subscribed ? (
            <BellOff className="h-4 w-4" />
          ) : (
            <Bell className="h-4 w-4" />
          )}
          {subscribed ? "Turn off reminders" : "Turn on reminders"}
        </Button>
      )}
    </section>
  );
}

function DataCard() {
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

const THEME_META: Record<
  ThemeName,
  {
    label: string;
    tagline: string;
    xFactor: string;
    icon: typeof Sparkles;
    swatch: { bg: string; accent: string; accent2: string };
  }
> = {
  brutalist: {
    label: "Brutalist",
    tagline: "Colour-blocked and loud",
    xFactor: "Oversized display numerals, flat blocks, a floating pill nav",
    icon: Zap,
    swatch: { bg: "hsl(0 0% 4%)", accent: "hsl(72 89% 60%)", accent2: "hsl(6 78% 62%)" },
  },
  oled: {
    label: "OLED",
    tagline: "True black, zero color",
    xFactor: "Pure #000 in dark mode — pixels off, not just dark",
    icon: Contrast,
    swatch: { bg: "hsl(0 0% 0%)", accent: "hsl(0 0% 38%)", accent2: "hsl(0 0% 58%)" },
  },
};

function ThemePicker() {
  const themeName = useAppStore((s) => s.themeName);
  const setThemeName = useAppStore((s) => s.setThemeName);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {(Object.keys(THEME_META) as ThemeName[]).map((key) => {
        const meta = THEME_META[key];
        const active = themeName === key;
        return (
          <button
            key={key}
            onClick={() => {
              haptic();
              setThemeName(key);
            }}
            className={cn(
              "flex flex-col gap-3 rounded-3xl border p-4 text-left transition-all",
              active ? "border-accent bg-accent/[0.06] shadow-pop" : "hover:bg-surface-2/60"
            )}
          >
            <div
              className="flex h-16 items-center justify-center gap-2 rounded-2xl"
              style={{ background: meta.swatch.bg }}
            >
              <span
                className="h-3.5 w-3.5 rounded-full"
                style={{ background: meta.swatch.accent }}
              />
              <span
                className="h-3.5 w-3.5 rounded-full"
                style={{ background: meta.swatch.accent2 }}
              />
            </div>
            <div>
              <p className="flex items-center gap-1.5 font-bold">
                <meta.icon className="h-4 w-4 text-accent" />
                {meta.label}
                {active && <Check className="ml-auto h-4 w-4 text-accent" />}
              </p>
              <p className="mt-0.5 text-xs font-semibold text-muted">{meta.tagline}</p>
              <p className="mt-1.5 text-[11px] leading-snug text-muted/80">{meta.xFactor}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Auto-marking is opt-in and reversible, and says exactly how many rows
 * it would write before it writes any of them. Inventing attendance
 * silently would be worse than the daily friction it removes.
 */
function AutoMarkCard() {
  const { data: settings } = useSettings();
  const update = useUpdateSettings();
  const pending = usePendingAutoMarks();
  const autoMark = useAutoMark();
  const clearAuto = useClearAutoMarks();
  const { data: attendance } = useAttendance();

  const on = settings?.auto_mark_present === true;
  const autoCount = (attendance ?? []).filter((a) => a.auto_marked).length;

  return (
    <section className="card space-y-4 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-good/10 text-good-deep">
            <Wand2 className="h-5 w-5" />
          </span>
          <div>
            <p className="font-bold">Assume present</p>
            <p className="text-xs text-muted">
              Past classes you never marked count as attended. You only record the
              days you missed.
            </p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Assume present for unmarked past classes"
          onClick={() => update.mutate({ auto_mark_present: !on })}
          className={cn(
            "relative h-7 w-12 shrink-0 rounded-full transition-colors",
            on ? "bg-good" : "bg-surface-2"
          )}
        >
          <span
            className={cn(
              "absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform",
              on ? "translate-x-6" : "translate-x-1"
            )}
          />
        </button>
      </div>

      <p className="text-xs text-muted">{describePending(pending)}</p>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={!pending.length || autoMark.isPending}
          onClick={() => autoMark.mutate(pending)}
        >
          {autoMark.isPending ? "Marking…" : "Catch up now"}
        </Button>
        {autoCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            disabled={clearAuto.isPending}
            onClick={() => clearAuto.mutate()}
          >
            Undo {autoCount} auto-marked
          </Button>
        )}
      </div>

      <p className="text-[11px] text-muted">
        Today's classes are never auto-marked, and anything you marked by hand —
        present, absent, or cancelled — is never changed.
      </p>
    </section>
  );
}

/** Who you're signed in as, and the way out. */
function AccountCard() {
  const { session } = useSession();
  const [busy, setBusy] = useState(false);
  const email = session?.user?.email ?? "";

  return (
    <section className="card flex items-center justify-between gap-4 p-5">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-accent">
          <UserRound className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="font-bold">Signed in</p>
          <p className="truncate text-xs text-muted">{email || "—"}</p>
        </div>
      </div>
      <Button
        variant="secondary"
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          // Only the session goes. The PIN and its data stay put, so
          // signing back in returns you to exactly the same place.
          await signOut();
          setBusy(false);
        }}
      >
        Sign out
      </Button>
    </section>
  );
}

export default function Settings() {
  const themeMode = useAppStore((s) => s.themeMode);
  const setThemeMode = useAppStore((s) => s.setThemeMode);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="px-1 text-2xl font-extrabold tracking-tight lg:text-3xl">Settings</h1>

      <SetupCard />

      <div className="space-y-3">
        <SectionTitle>Profile</SectionTitle>
        <ProfileCard />
      </div>

      <div className="space-y-3">
        <SectionTitle>Account</SectionTitle>
        <AccountCard />
      </div>

      <div className="space-y-3">
        <SectionTitle>Cross-device sync</SectionTitle>
        <PinCard />
        <SyncCard />
      </div>

      <div className="space-y-3">
        <SectionTitle>Appearance</SectionTitle>
        <ThemePicker />
        <section className="card p-5">
          <Segmented<ColorMode>
            layoutId="theme-mode"
            options={[
              { value: "light", label: "Light" },
              { value: "system", label: "System" },
              { value: "dark", label: "Dark" },
            ]}
            value={themeMode}
            onChange={setThemeMode}
          />
          <p className="mt-3 flex items-center justify-center gap-4 text-xs text-muted">
            <span className="flex items-center gap-1"><Sun className="h-3.5 w-3.5" /> light</span>
            <span className="flex items-center gap-1"><Monitor className="h-3.5 w-3.5" /> auto</span>
            <span className="flex items-center gap-1"><Moon className="h-3.5 w-3.5" /> dark</span>
          </p>
        </section>
      </div>

      <div className="space-y-3">
        <SectionTitle>Notifications</SectionTitle>
        <NotificationsCard />
      </div>

      <div className="space-y-3">
        <SectionTitle>Academics</SectionTitle>
        <SemesterDatesCard />
        <AutoMarkCard />
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
