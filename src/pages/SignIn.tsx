import { useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { ArrowRight, Loader2, Sparkles } from "lucide-react";
import { say, VOICE } from "@/lib/voice";
import { useTone } from "@/hooks/useTone";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { MIN_PASSWORD, signIn, signUp } from "@/lib/auth";

/**
 * Email and password, once per device.
 *
 * No code to wait for, no link to click, nothing that leaves the app —
 * which is what makes this survive being an installed PWA. The
 * autoComplete hints matter more than they look: they're what let the
 * keychain fill both fields on a Face ID tap, so the steady state is
 * faster than typing a 4-digit PIN was.
 */
export default function SignIn() {
  const tone = useTone();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const creating = mode === "up";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes("@")) {
      toast.error("Enter your email address");
      return;
    }
    if (creating && password.length < MIN_PASSWORD) {
      toast.error(`Password needs at least ${MIN_PASSWORD} characters`);
      return;
    }
    setBusy(true);
    try {
      if (creating) {
        await signUp(email, password);
        toast.success("Account created");
      } else {
        await signIn(email, password);
      }
      // useSession picks the new session up and swaps this screen out.
    } catch (err) {
      toast.error((err as Error).message);
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
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand text-brand-ink">
            <Sparkles className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xl font-extrabold tracking-tight">AcadKit</p>
            <p className="text-xs text-muted">
              {creating ? say(VOICE.signUpTagline, tone) : say(VOICE.signInTagline, tone)}
            </p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4">
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

          <Field label="Password">
            <Input
              type="password"
              autoComplete={creating ? "new-password" : "current-password"}
              placeholder={creating ? `At least ${MIN_PASSWORD} characters` : "••••••••"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>

          <Button size="lg" className="h-12 w-full" disabled={busy || !password}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            {busy ? "One moment…" : creating ? say(VOICE.signUpAction, tone) : say(VOICE.signInAction, tone)}
          </Button>
        </form>

        <button
          type="button"
          className="mt-4 w-full text-center text-xs font-semibold text-muted underline-offset-4 hover:underline"
          onClick={() => setMode(creating ? "in" : "up")}
        >
          {creating ? say(VOICE.signUpSwap, tone) : say(VOICE.signInSwap, tone)}
        </button>

        <p className="mt-6 px-1 text-center text-xs text-muted">
          {say(VOICE.staysSignedIn, tone)}
        </p>
      </motion.div>
    </div>
  );
}
