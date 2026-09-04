import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarRange,
  Check,
  Loader2,
  Bell,
  BellOff,
  Monitor,
  Moon,
  Pencil,
  Plus,
  Sun,
  Wand2,
  UserRound,
  ChevronDown,
  ArrowUpRight,
  LayoutGrid,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Dot } from "@/components/ui/misc";
import { SubjectSheet } from "@/components/sheets/subject-sheet";
import { usePush } from "@/hooks/usePush";
import { useSession } from "@/hooks/useSession";
import { SetupCard } from "@/components/settings/setup-card";
import { DataCard } from "@/components/settings/data-card";
import { ThemePicker } from "@/components/settings/theme-picker";
import { say, VOICE } from "@/lib/voice";
import { useTone } from "@/hooks/useTone";
import { syncHealth } from "@/lib/syncHealth";
import { relativeDay } from "@/lib/dates";
import { signOut } from "@/lib/auth";
import {
  updateSettings as apiUpdateSettings,
} from "@/api/queries";
import {
  useAttendance,
  useAutoMark,
  useClearAutoMarks,
  usePortalSnapshots,
  useSettings,
  useSubjects,
  useUpdateSettings,
} from "@/hooks/useData";
import { semesterWindow } from "@/lib/calendar";
import { describePending } from "@/lib/autoMark";
import { usePendingAutoMarks } from "@/hooks/useAutoMark";
import { cn, haptic } from "@/lib/utils";
import { useAppStore, type ColorMode } from "@/store/app";
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

function SemesterDatesCard() {
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  // Depend on the two fields, not the settings object: React Query
  // hands back a new object on every refetch, so listing `settings`
  // would satisfy the linter by defeating the memo.
  const semStart = settings?.sem_start ?? null;
  const semEnd = settings?.sem_end ?? null;
  const defaults = useMemo(
    () => semesterWindow({ sem_start: semStart, sem_end: semEnd }),
    [semStart, semEnd]
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
          {/* left-0 is load-bearing: an absolute box with `left: auto`
              falls back to its static position, which here resolves to
              24px — the translate then lands the knob outside the
              track entirely. */}
          <span
            className={cn(
              "absolute left-0 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform",
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

/**
 * A section that starts folded away.
 *
 * Semester dates, subjects and the data tools are things you touch once
 * a term, but they sat permanently expanded between the settings you
 * actually reach for. Collapsed by default; the open state lives in
 * component state only, so Settings always opens the same shape rather
 * than however you left it three weeks ago.
 */
function CollapsibleSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          haptic();
          setOpen((o) => !o);
        }}
        className="flex w-full items-center justify-between px-1 py-1 text-left"
      >
        <span className="text-xs font-bold uppercase tracking-widest text-muted">{title}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 32 }}
            // Children have shadows and rings that would be clipped
            // mid-animation; overflow only hides while moving.
            className="space-y-3 overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Pull everything down again, on demand.
 *
 * Data arrives on its own — React Query refetches on focus, realtime
 * pushes cross-device edits, the portal sync writes from a scheduled
 * job — but all of that is invisible, and there was no way to *ask*.
 * Pull-to-refresh is deliberately off (the app disables overscroll so
 * standalone iOS doesn't rubber-band), so this is the gesture's
 * replacement.
 *
 * It also reports how old the portal figures are, since "refresh" and
 * "the portal hasn't spoken in a week" are the same question asked twice
 * — and refetching can't fix the second one.
 */
function RefreshCard() {
  const tone = useTone();
  const qc = useQueryClient();
  const { data: snapshots } = usePortalSnapshots();
  const [busy, setBusy] = useState(false);

  const health = syncHealth(snapshots ?? []);

  return (
    <section className="card space-y-3 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-accent">
            <RefreshCw className={cn("h-5 w-5", busy && "animate-spin")} />
          </span>
          <div>
            <p className="font-bold">Refresh data</p>
            <p className="mt-0.5 text-xs text-muted">
              Pull the latest from the server on every device.
            </p>
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          className="shrink-0"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              // refetchQueries, not invalidateQueries: invalidate marks
              // things stale and returns immediately, so the button would
              // finish before anything arrived.
              //
              // Scoped to active queries, and raced against a timeout.
              // Unfiltered, it also awaits inactive and paused ones —
              // a query paused offline never settles, and the button
              // stuck on "Refreshing…" forever. A refresh that cannot
              // fail to finish is worth more than one that reports on
              // every cached query in the app.
              await Promise.race([
                qc.refetchQueries({ type: "active" }),
                new Promise((_, reject) =>
                  setTimeout(() => reject(new Error("timeout")), 10_000)
                ),
              ]);
              toast.success("Up to date");
            } catch {
              toast.error("Couldn't reach the server", {
                description: "You're seeing the last data this device stored.",
              });
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      <p className="text-xs font-medium text-muted">
        {health.state === "never"
          ? say(VOICE.syncNever, tone)
          : health.state === "stale" && health.days !== null
            ? say(VOICE.syncStale, tone, health.days)
            : `Portal data synced ${relativeDay(health.asOf!)}.`}
      </p>

      {health.state !== "never" && (
        <p className="text-[11px] text-muted">
          Refreshing pulls what the server already has. New portal figures
          need the sync bookmarklet while you're signed in to the portal.
        </p>
      )}
    </section>
  );
}

/**
 * The deadlines view, and how to get it onto a home screen.
 *
 * /widget existed with nothing linking to it, so the only way in was
 * typing the URL — which is no way to ship a feature. It lives here
 * rather than in the nav because it isn't a page you visit inside the
 * app; it's a page you leave the app to install.
 */
function WidgetCard() {
  return (
    <section className="card space-y-3 p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-accent">
          <LayoutGrid className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="font-bold">Deadlines widget</p>
          <p className="mt-0.5 text-xs text-muted">
            A stripped-down page showing only what's due. Add it to your home
            screen and it installs as its own icon, called “Due”.
          </p>
        </div>
      </div>

      <a
        href="/widget"
        className="flex items-center justify-between rounded-2xl border bg-surface-2/40 px-4 py-3 text-sm font-bold transition-transform active:scale-[0.99]"
      >
        Open the widget
        <ArrowUpRight className="h-4 w-4 text-muted" />
      </a>

      <p className="text-[11px] text-muted">
        On iPhone: open it, then Share → Add to Home Screen. It opens straight
        to your deadlines, without the rest of the app.
      </p>
    </section>
  );
}

export default function Settings() {
  const tone = useTone();
  const themeMode = useAppStore((s) => s.themeMode);
  const setThemeMode = useAppStore((s) => s.setThemeMode);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="px-1 text-2xl font-extrabold tracking-tight lg:text-3xl">{say(VOICE.titleSettings, tone)}</h1>

      <SetupCard />

      <div className="space-y-3">
        <SectionTitle>Profile</SectionTitle>
        <ProfileCard />
      </div>

      <div className="space-y-3">
        <SectionTitle>Account</SectionTitle>
        <AccountCard />
        <RefreshCard />
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
        <SectionTitle>Home screen</SectionTitle>
        <WidgetCard />
      </div>

      <div className="space-y-3">
        <SectionTitle>Notifications</SectionTitle>
        <NotificationsCard />
      </div>

      <CollapsibleSection title="Academics">
        <SemesterDatesCard />
        <AutoMarkCard />
        <SubjectsCard />
      </CollapsibleSection>

      <CollapsibleSection title="Data management">
        <DataCard />
      </CollapsibleSection>

      <p className="pb-4 pt-2 text-center text-xs text-muted">
        {say(VOICE.footer, tone)}
      </p>
    </div>
  );
}
