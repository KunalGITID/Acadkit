import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, X } from "lucide-react";
import { useTimetable } from "@/hooks/useData";
import { cn } from "@/lib/utils";
import { isInstalled } from "@/lib/activity";

const DISMISSED_KEY = "acadkit:getting-started-dismissed";

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * The two things a new account still needs after onboarding. Each ticks
 * itself off; the card goes once both are done or it is dismissed.
 */
export function GettingStartedCard() {
  const { data: timetable, isLoading } = useTimetable();
  const [dismissed, setDismissed] = useState(readDismissed);

  const steps = [
    {
      done: (timetable?.length ?? 0) > 0,
      title: "Add your timetable",
      detail: "Paste it from the portal, or build it by Day Order.",
      to: "/timetable",
    },
    {
      done: isInstalled(),
      title: "Put AcadKit on your home screen",
      detail: isIos()
        ? "In Safari, tap Share, then Add to Home Screen."
        : "In your browser's menu, tap Install app or Add to Home screen.",
      to: null,
    },
  ];

  const left = steps.filter((s) => !s.done).length;
  if (dismissed || isLoading || left === 0) return null;

  return (
    <section aria-labelledby="getting-started" className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-muted">getting started</p>
          <h2 id="getting-started" className="mt-0.5 text-lg font-extrabold">
            {left === 1 ? "One thing left" : `${left} things left`}
          </h2>
        </div>
        <button
          type="button"
          aria-label="Dismiss getting started"
          onClick={() => {
            try {
              localStorage.setItem(DISMISSED_KEY, "1");
            } catch {
              /* private mode: it just comes back next time */
            }
            setDismissed(true);
          }}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-surface-2 hover:text-ink"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <ol className="mt-3 space-y-2">
        {steps.map((s) => {
          const body = (
            <>
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                  s.done && "border-good bg-good text-emerald-950"
                )}
              >
                {s.done && <Check className="h-3 w-3" strokeWidth={3} />}
              </span>
              <span className="min-w-0">
                <span className={cn("block text-sm font-bold", s.done && "text-muted line-through")}>
                  {s.title}
                  <span className="sr-only">{s.done ? " (done)" : ""}</span>
                </span>
                {!s.done && <span className="block text-xs text-muted">{s.detail}</span>}
              </span>
            </>
          );
          return (
            <li key={s.title}>
              {s.to && !s.done ? (
                <Link to={s.to} className="flex items-start gap-3 rounded-2xl border bg-surface-2/40 p-3 hover:bg-surface-2">
                  {body}
                </Link>
              ) : (
                <div className="flex items-start gap-3 rounded-2xl border bg-surface-2/40 p-3">{body}</div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
