import { useState } from "react";
import { motion } from "framer-motion";
import { Loader2, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { accountExists, seedAccount } from "@/api/queries";
import { claimDevice } from "@/lib/auth";
import { generatePin } from "@/lib/pin";
import { useAppStore } from "@/store/app";

export default function Onboarding() {
  const setPin = useAppStore((s) => s.setPin);
  const [busy, setBusy] = useState(false);

  async function createFresh() {
    setBusy(true);
    try {
      // Avoid colliding with an existing PIN's data
      let pin = generatePin();
      for (let i = 0; i < 5 && (await accountExists(pin)); i++) pin = generatePin();
      await seedAccount(pin);
      await claimDevice(pin);
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
            Attendance, marks, SGPA and your day-order timetable — on every device you
            sign in to.
          </p>
        </div>

        <Button size="lg" className="h-14 w-full" onClick={createFresh} disabled={busy}>
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Wand2 className="h-5 w-5" />}
          Set up my semester
        </Button>
        <p className="pt-3 text-center text-xs text-muted">
          Seeds your SRM subjects so there's something to edit rather than a blank app.
        </p>
      </motion.div>
    </div>
  );
}
