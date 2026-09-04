import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { ArrowRight, Loader2, Mail, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { sendCode, verifyCode } from "@/lib/auth";

/**
 * Email, then a 6-digit code. No password to invent or forget, and no
 * redirect out of the app — which is what makes this survive being an
 * installed PWA (see src/lib/auth.ts).
 *
 * You do this once per device. The session persists and refreshes
 * itself afterwards.
 */
export default function SignIn() {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes("@")) {
      toast.error("Enter your email address");
      return;
    }
    setBusy(true);
    try {
      await sendCode(email);
      setStep("code");
      toast.success("Code sent — check your email");
      // The field only exists after the step flips.
      setTimeout(() => codeRef.current?.focus(), 50);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await verifyCode(email, code);
      // useSession picks the new session up and swaps the screen out.
    } catch (err) {
      toast.error((err as Error).message);
      setCode("");
      codeRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-5 pb-safe-b pt-safe-t">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        <div className="mb-8 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent text-white">
            <Sparkles className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xl font-extrabold tracking-tight">AcadKit</p>
            <p className="text-xs text-muted">
              {step === "email" ? "Sign in to sync your semester" : `Code sent to ${email}`}
            </p>
          </div>
        </div>

        {step === "email" ? (
          <form onSubmit={submitEmail} className="space-y-4">
            <Field label="Email">
              <Input
                type="email"
                inputMode="email"
                autoComplete="email"
                autoFocus
                placeholder="you@srmist.edu.in"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Button size="lg" className="h-12 w-full" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              {busy ? "Sending…" : "Email me a code"}
            </Button>
            <p className="px-1 text-center text-xs text-muted">
              No password. We send a 6-digit code, and this device stays signed in
              afterwards.
            </p>
          </form>
        ) : (
          <form onSubmit={submitCode} className="space-y-4">
            <Field label="6-digit code">
              <Input
                ref={codeRef}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                className="text-center font-mono text-2xl tracking-[0.4em]"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              />
            </Field>
            <Button size="lg" className="h-12 w-full" disabled={busy || code.length < 6}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              {busy ? "Checking…" : "Sign in"}
            </Button>
            <button
              type="button"
              className="w-full text-center text-xs font-semibold text-muted underline-offset-4 hover:underline"
              onClick={() => {
                setStep("email");
                setCode("");
              }}
            >
              Use a different email
            </button>
          </form>
        )}
      </motion.div>
    </div>
  );
}
