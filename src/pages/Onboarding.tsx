import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, ClipboardPaste, GraduationCap, ListPlus, Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { say, VOICE } from "@/lib/voice";
import { useTone } from "@/hooks/useTone";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Dot } from "@/components/ui/misc";
import { importPortalData, setupAccount } from "@/api/queries";
import { claimDevice, ownedDevices } from "@/lib/auth";
import { claimFreshPin } from "@/lib/devices";
import { generatePin } from "@/lib/pin";
import { draftProblem, draftsFromPortal, draftsFromPreset, type DraftSubject } from "@/lib/onboarding";
import { looksLikeHtml, parsePastedPortal, type PastedPortal } from "@/lib/portal/paste";
import { cn, haptic } from "@/lib/utils";
import { useAppStore } from "@/store/app";

type Step = "about" | "subjects";
type Source = "portal" | "preset" | "empty";

const SOURCES: Array<{ value: Source; icon: typeof Sparkles; title: string; blurb: string }> = [
  {
    value: "portal",
    icon: ClipboardPaste,
    title: "Paste from the SRM portal",
    blurb: "Your own subjects, whatever your branch, plus the attendance you have so far.",
  },
  {
    value: "preset",
    icon: GraduationCap,
    title: "CSE (Data Science), Semester 3",
    blurb: "The 2026 odd-semester list for that class. Edit it later if yours differs.",
  },
  {
    value: "empty",
    icon: ListPlus,
    title: "Start empty",
    blurb: "Add subjects yourself in Settings.",
  },
];

/**
 * A new account's first run: who you are, then where your subjects come
 * from. Nothing is written until the last step, so backing out halfway
 * leaves no half-made account behind.
 */
export default function Onboarding() {
  const tone = useTone();
  const setPin = useAppStore((s) => s.setPin);
  const [step, setStep] = useState<Step>("about");
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [semester, setSemester] = useState(3);
  const [minAttendance, setMinAttendance] = useState("75");
  const [targetSgpa, setTargetSgpa] = useState("");

  const [source, setSource] = useState<Source | null>(null);
  const [pasted, setPasted] = useState<PastedPortal | null>(null);
  const [plainText, setPlainText] = useState(false);
  const [drafts, setDrafts] = useState<DraftSubject[]>([]);
  const box = useRef<HTMLDivElement>(null);

  const minAtt = Number(minAttendance);
  const target = targetSgpa.trim() === "" ? null : Number(targetSgpa);
  const aboutProblem =
    !Number.isFinite(minAtt) || minAtt < 1 || minAtt > 100
      ? "Minimum attendance is a percentage between 1 and 100"
      : target !== null && (!Number.isFinite(target) || target < 0 || target > 10)
        ? "Target SGPA is between 0 and 10"
        : null;

  function pick(next: Source) {
    haptic();
    setSource(next);
    setPasted(null);
    setPlainText(false);
    setDrafts(next === "preset" ? draftsFromPreset() : []);
  }

  function onPaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const html = e.clipboardData.getData("text/html");
    // Plain text only is the usual failure on iOS (Reader view, or a
    // partial selection): the table structure the parser reads is gone.
    if (!html || !looksLikeHtml(html)) {
      setPlainText(Boolean(e.clipboardData.getData("text/plain")));
      setPasted(null);
      setDrafts([]);
      return;
    }
    const out = parsePastedPortal(html);
    setPlainText(false);
    setPasted(out);
    setDrafts(draftsFromPortal(out.attendance));
    haptic();
  }

  function setCredits(code: string, raw: string) {
    const credits = raw.trim() === "" ? null : Number(raw);
    setDrafts((ds) => ds.map((d) => (d.code === code ? { ...d, credits } : d)));
  }

  const subjectsProblem =
    source === null
      ? "Choose where your subjects come from"
      : source === "portal" && drafts.length === 0
        ? "Paste your attendance page first"
        : draftProblem(drafts);

  async function finish() {
    setBusy(true);
    try {
      // An account that already owns a PIN keeps it: onboarding also shows when the lookup failed offline, and claiming a second PIN would split your data across two.
      const owned = await ownedDevices();
      const pin = owned[0] ?? (await claimFreshPin(claimDevice, generatePin));
      await setupAccount(pin, {
        name,
        semester,
        min_attendance: minAtt,
        target_sgpa: target,
        subjects: drafts,
      });
      // The attendance you pasted to get your subjects is worth keeping.
      if (source === "portal" && pasted) {
        await importPortalData(pin, { attendance: pasted.attendance, marks: pasted.marks });
      }
      setPin(pin);
      toast.success(say(VOICE.onboardingDone, tone));
    } catch (err) {
      toast.error("Couldn't set things up", {
        description: err instanceof Error ? err.message : "Check your connection and retry.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 pb-safe-b pt-safe-t">
      <main className="w-full max-w-sm py-10">
        <div className="mb-8 text-center">
          <motion.div
            initial={{ scale: 0, rotate: -30 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.1 }}
            className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[24px] bg-brand text-brand-ink shadow-pop"
          >
            <Sparkles className="h-8 w-8" aria-hidden />
          </motion.div>
          <h1 className="text-3xl font-extrabold tracking-tight">
            Welcome to <span className="accent-gradient-text">AcadKit</span>
          </h1>
          <p className="mt-2 text-[15px] text-muted">{say(VOICE.onboardingBlurb, tone)}</p>
          <p className="mt-4 text-xs font-bold uppercase tracking-widest text-muted">
            Step {step === "about" ? 1 : 2} of 2
          </p>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {step === "about" ? (
            <motion.form
              key="about"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (!aboutProblem) setStep("subjects");
              }}
            >
              <h2 className="text-lg font-extrabold">About you</h2>
              <Field label="Your name">
                <Input
                  autoComplete="given-name"
                  placeholder="What should we call you?"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              <Field label="Semester">
                <Select value={semester} onChange={(e) => setSemester(Number(e.target.value))}>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                    <option key={n} value={n}>
                      Semester {n}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Minimum attendance %">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={100}
                    value={minAttendance}
                    onChange={(e) => setMinAttendance(e.target.value)}
                  />
                </Field>
                <Field label="Target SGPA">
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={10}
                    step="0.01"
                    placeholder="Optional"
                    value={targetSgpa}
                    onChange={(e) => setTargetSgpa(e.target.value)}
                  />
                </Field>
              </div>
              {aboutProblem && (
                <p role="alert" className="text-xs font-semibold text-bad-deep">
                  {aboutProblem}
                </p>
              )}
              <Button type="submit" size="lg" className="h-14 w-full" disabled={!!aboutProblem}>
                Next <ArrowRight className="h-5 w-5" aria-hidden />
              </Button>
            </motion.form>
          ) : (
            <motion.div
              key="subjects"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              className="space-y-4"
            >
              <h2 id="subjects-heading" className="text-lg font-extrabold">
                Your subjects
              </h2>
              <div role="radiogroup" aria-labelledby="subjects-heading" className="space-y-2.5">
                {SOURCES.map((s) => {
                  const active = source === s.value;
                  return (
                    <button
                      key={s.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => pick(s.value)}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition-colors",
                        active ? "border-accent bg-accent/10" : "bg-surface hover:bg-surface-2"
                      )}
                    >
                      <s.icon className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />
                      <span>
                        <span className="block text-sm font-bold">{s.title}</span>
                        <span className="block text-xs text-muted">{s.blurb}</span>
                      </span>
                    </button>
                  );
                })}
              </div>

              {source === "portal" && (
                <div className="space-y-2.5">
                  <ol className="space-y-1 text-xs text-muted">
                    <li>1. Open the attendance page on the SRM Academia portal.</li>
                    <li>2. Select the whole page and copy it.</li>
                    <li>3. Come back and paste into the box below.</li>
                  </ol>
                  <div
                    ref={box}
                    contentEditable
                    suppressContentEditableWarning
                    role="textbox"
                    tabIndex={0}
                    aria-label="Paste your attendance page here"
                    onPaste={onPaste}
                    className="min-h-20 overflow-hidden rounded-2xl border border-dashed bg-surface-2/40 p-4 text-xs text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    {drafts.length > 0
                      ? `Pasted - ${drafts.length} subject${drafts.length === 1 ? "" : "s"} found. Paste again to replace.`
                      : pasted || plainText
                        ? null
                        : "Tap here, then paste"}
                  </div>
                  {plainText && (
                    <p role="alert" className="rounded-2xl bg-warn/15 p-3 text-xs font-semibold text-warn-deep">
                      That came through as plain text, so the table was lost. Select the page
                      itself, not Reader view, and copy again.
                    </p>
                  )}
                  {pasted && drafts.length === 0 && (
                    <p role="alert" className="rounded-2xl bg-bad/10 p-3 text-xs font-semibold text-bad-deep">
                      No attendance table in that. Make sure it's the attendance page, copied whole.
                    </p>
                  )}
                </div>
              )}

              {drafts.length > 0 && (
                <section aria-label="Subjects to add" className="space-y-2">
                  <p className="text-xs font-semibold text-muted">
                    {drafts.length} subject{drafts.length === 1 ? "" : "s"}
                    {source === "portal" && drafts.some((d) => d.credits === null)
                      ? " - the portal doesn't show credits, so fill in the blanks"
                      : ""}
                  </p>
                  <ul className="space-y-2">
                    {drafts.map((d) => (
                      <li key={d.code} className="flex items-center gap-3 rounded-2xl border bg-surface-2/40 p-3">
                        <Dot color={d.color_hex} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold">{d.name}</p>
                          <p className="text-xs text-muted">
                            {d.code}
                            {d.type === "lab" ? " · lab" : ""}
                          </p>
                        </div>
                        <Input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={10}
                          aria-label={`Credits for ${d.name}`}
                          placeholder="Cr"
                          value={d.credits ?? ""}
                          onChange={(e) => setCredits(d.code, e.target.value)}
                          className={cn("h-10 w-16 px-2 text-center", d.credits === null && "border-warn")}
                        />
                        <button
                          type="button"
                          aria-label={`Remove ${d.name}`}
                          onClick={() => setDrafts((ds) => ds.filter((x) => x.code !== d.code))}
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-surface-2 hover:text-ink"
                        >
                          <X className="h-4 w-4" aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {subjectsProblem && source !== null && (
                <p role="status" className="text-xs font-semibold text-muted">
                  {subjectsProblem}
                </p>
              )}

              <div className="flex gap-2.5 pt-1">
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  className="h-14"
                  onClick={() => setStep("about")}
                  disabled={busy}
                  aria-label="Back"
                >
                  <ArrowLeft className="h-5 w-5" aria-hidden />
                </Button>
                <Button
                  type="button"
                  size="lg"
                  className="h-14 flex-1"
                  onClick={finish}
                  disabled={busy || !!subjectsProblem}
                >
                  {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : null}
                  {say(VOICE.onboardingAction, tone)}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
