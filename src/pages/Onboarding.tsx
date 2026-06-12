import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, KeyRound, Loader2, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { accountExists, ensureSettings, seedAccount } from "@/api/queries";
import { generatePin, isValidPin } from "@/lib/pin";
import { useAppStore } from "@/store/app";
import { cn } from "@/lib/utils";

type Mode = "choose" | "enter";

/** Four single-digit boxes with auto-advance. */
function PinBoxes({
  value,
  onChange,
  onComplete,
}: {
  value: string;
  onChange: (v: string) => void;
  onComplete: (pin: string) => void;
}) {
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  function handleChange(i: number, ch: string) {
    const digit = ch.replace(/\D/g, "").slice(-1);
    const next = (value.slice(0, i) + (digit || "") + value.slice(i + 1)).slice(0, 4);
    onChange(next);
    if (digit && i < 3) inputs.current[i + 1]?.focus();
    if (digit && i === 3 && isValidPin(next)) onComplete(next);
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !value[i] && i > 0) inputs.current[i - 1]?.focus();
  }

  return (
    <div className="flex justify-center gap-3">
      {[0, 1, 2, 3].map((i) => (
        <input
          key={i}
          ref={(el) => {
            inputs.current[i] = el;
          }}
          inputMode="numeric"
          autoComplete="off"
          aria-label={`PIN digit ${i + 1}`}
          value={value[i] ?? ""}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          className={cn(
            "h-16 w-14 rounded-2xl border-2 bg-surface text-center font-mono text-2xl font-bold",
            "border-line/10 focus:border-accent transition-colors"
          )}
        />
      ))}
    </div>
  );
}

export default function Onboarding() {
  const setPin = useAppStore((s) => s.setPin);
  const [mode, setMode] = useState<Mode>("choose");
  const [pinInput, setPinInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function createFresh() {
    setBusy(true);
    try {
      // Avoid colliding with an existing PIN's data
      let pin = generatePin();
      for (let i = 0; i < 5 && (await accountExists(pin)); i++) pin = generatePin();
      await seedAccount(pin);
      setPin(pin);
      toast.success(`Your sync PIN is ${pin}`, {
        description: "Find it anytime in Settings — it links all your devices.",
        duration: 8000,
      });
    } catch (err) {
      toast.error("Couldn't set things up", {
        description: err instanceof Error ? err.message : "Check your connection and retry.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function syncExisting(pin: string) {
    setBusy(true);
    try {
      if (await accountExists(pin)) {
        await ensureSettings(pin);
        setPin(pin);
        toast.success("Synced — your data is here");
      } else {
        toast.error(`No data found for PIN ${pin}`, {
          description: "Double-check the digits, or create a fresh space instead.",
        });
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
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 pb-safe-b pt-safe-t">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 24 }}
        className="w-full max-w-sm"
      >
        <div className="mb-10 text-center">
          <motion.div
            initial={{ scale: 0, rotate: -30 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.1 }}
            className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-[28px] bg-accent text-white shadow-pop"
          >
            <Sparkles className="h-9 w-9" />
          </motion.div>
          <h1 className="text-3xl font-extrabold tracking-tight">
            Welcome to <span className="accent-gradient-text">AcadKit</span>
          </h1>
          <p className="mt-2 text-[15px] text-muted">
            Attendance, marks, SGPA and your day-order timetable — synced to every device with one
            4-digit PIN.
          </p>
        </div>

        <AnimatePresence mode="wait">
          {mode === "choose" ? (
            <motion.div
              key="choose"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-3"
            >
              <Button size="lg" className="h-14 w-full" onClick={createFresh} disabled={busy}>
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Wand2 className="h-5 w-5" />}
                Start fresh
              </Button>
              <Button
                variant="secondary"
                size="lg"
                className="h-14 w-full"
                onClick={() => setMode("enter")}
                disabled={busy}
              >
                <KeyRound className="h-5 w-5" />
                I have a PIN
              </Button>
              <p className="pt-2 text-center text-xs text-muted">
                Starting fresh seeds your SRM subjects and generates your PIN.
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="enter"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-5"
            >
              <PinBoxes value={pinInput} onChange={setPinInput} onComplete={syncExisting} />
              <Button
                size="lg"
                className="h-14 w-full"
                disabled={!isValidPin(pinInput) || busy}
                onClick={() => syncExisting(pinInput)}
              >
                {busy ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <ArrowRight className="h-5 w-5" />
                )}
                Sync my data
              </Button>
              <button
                onClick={() => setMode("choose")}
                className="mx-auto block text-sm font-semibold text-muted hover:text-ink"
                disabled={busy}
              >
                ← Back
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
