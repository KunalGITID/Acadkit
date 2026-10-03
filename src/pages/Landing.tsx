import { ArrowRight, CalendarDays, Github, GraduationCap, ShieldCheck, Smartphone, Sparkles, Target } from "lucide-react";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

const REPO = "https://github.com/KunalGITID/Acadkit";

const FEATURES = [
  {
    icon: Target,
    title: "Attendance as a budget",
    body: "How many classes you can still miss per subject, and what it takes to get back above 75% if you've slipped.",
  },
  {
    icon: GraduationCap,
    title: "Marks, grades and SGPA",
    body: "What each remaining test has to return for the grade you want, and the SGPA you're on course for.",
  },
  {
    icon: CalendarDays,
    title: "Day Order, handled",
    body: "The timetable follows SRM's rotating Day Order and the academic calendar's holidays, so today is always right.",
  },
  {
    icon: Smartphone,
    title: "Works offline, installs like an app",
    body: "Mark attendance with no signal; it syncs when you're back. Add it to your home screen - no app store needed.",
  },
];

export type AuthMode = "in" | "up";

/**
 * What a signed-out visitor sees first: what AcadKit is, a look at it,
 * and the way in. Signed-in devices never see it.
 *
 * Deliberately light: plain buttons and no Supabase, animation library or
 * query client, so src/public.tsx can show it before the app has loaded.
 */
export default function Landing({ onAuth }: { onAuth: (mode: AuthMode) => void }) {
  const cta = (
    <div className="flex flex-col gap-2.5 sm:flex-row">
      <button
        type="button"
        className={cn(buttonVariants({ size: "lg" }), "h-14 sm:flex-1")}
        onClick={() => onAuth("up")}
      >
        Get started, it's free <ArrowRight className="h-5 w-5" aria-hidden />
      </button>
      <button
        type="button"
        className={cn(buttonVariants({ size: "lg", variant: "secondary" }), "h-14 sm:flex-1")}
        onClick={() => onAuth("in")}
      >
        Sign in
      </button>
    </div>
  );

  return (
    <div className="min-h-dvh pb-safe-b pt-safe-t">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
        <span className="flex items-center gap-2.5 text-lg font-extrabold tracking-tight">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-brand-ink">
            <Sparkles className="h-4 w-4" aria-hidden />
          </span>
          AcadKit
        </span>
        <button type="button" className={buttonVariants({ variant: "ghost", size: "sm" })} onClick={() => onAuth("in")}>
          Sign in
        </button>
      </header>

      <main className="mx-auto max-w-5xl px-5">
        <section className="grid items-center gap-10 py-8 lg:grid-cols-2 lg:py-16">
          <div className="space-y-6">
            <p className="text-xs font-bold uppercase tracking-widest text-muted">for srm ktr students</p>
            <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight lg:text-6xl">
              Your attendance, marks and Day Order, in one place.
            </h1>
            <p className="text-[17px] text-muted">
              AcadKit tells you how many classes you can still skip, what you need in the next test,
              and what's on today - on your phone, even offline.
            </p>
            {cta}
            <p className="text-xs text-muted">Free and open source. No ads, no tracking.</p>
          </div>

          <figure className="mx-auto w-full max-w-[300px]">
            <div className="overflow-hidden rounded-[2.5rem] border-10 border-ink bg-surface shadow-pop">
              <img
                src="/demo.webp"
                width={390}
                height={844}
                // The page's largest element on a phone: fetch it first (index.html preloads it for signed-out visitors).
                fetchPriority="high"
                alt="AcadKit on a phone: today's classes on Home, attendance per subject, marking a class from the calendar, and the predicted SGPA."
                className="block h-auto w-full"
              />
            </div>
            <figcaption className="mt-3 text-center text-xs text-muted">Recorded on sample data.</figcaption>
          </figure>
        </section>

        <section aria-labelledby="features" className="py-10">
          <h2 id="features" className="mb-6 text-2xl font-extrabold tracking-tight">
            What it does
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <li key={f.title} className="card p-5">
                <f.icon className="h-6 w-6 text-accent-deep" aria-hidden />
                <h3 className="mt-3 font-extrabold">{f.title}</h3>
                <p className="mt-1.5 text-sm text-muted">{f.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="privacy" className="py-10">
          <div className="card p-6">
            <ShieldCheck className="h-7 w-7 text-good-deep" aria-hidden />
            <h2 id="privacy" className="mt-3 text-2xl font-extrabold tracking-tight">
              Your data stays yours
            </h2>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-muted">
              <li>Your marks and attendance are stored in your account, and nobody else's account can read them - that's tested on every change.</li>
              <li>No ads and no trackers. The only usage count is which days an account opens the app.</li>
              <li>You never type your SRM portal password into AcadKit. You paste pages you've already opened.</li>
            </ul>
          </div>
        </section>

        <section aria-labelledby="start" className="py-10">
          <h2 id="start" className="mb-2 text-2xl font-extrabold tracking-tight">
            Two minutes to set up
          </h2>
          <p className="mb-5 text-sm text-muted">
            Sign up, paste your attendance page from the portal, and your subjects are in.
          </p>
          {cta}
        </section>
      </main>

      <footer className="mx-auto max-w-5xl space-y-2 border-t px-5 py-8 text-xs text-muted">
        <p>
          Made by a student at SRM KTR. AcadKit is not affiliated with or endorsed by SRM Institute
          of Science and Technology.
        </p>
        <p className="flex items-center gap-1.5">
          <Github className="h-3.5 w-3.5" aria-hidden />
          <a href={REPO} className="font-semibold underline underline-offset-4 hover:text-ink">
            Open source on GitHub
          </a>
          <span aria-hidden>·</span> MIT licence
        </p>
      </footer>
    </div>
  );
}
