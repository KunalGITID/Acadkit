import { useEffect, useMemo } from "react";
import { CalendarCheck2 } from "lucide-react";
import { Dot } from "@/components/ui/misc";
import { useDeadlines, useSubjects } from "@/hooks/useData";
import { deadlineLabel } from "@/lib/deadlines";
import { say, VOICE } from "@/lib/voice";
import { useTone } from "@/hooks/useTone";
import { cn } from "@/lib/utils";

/**
 * A chrome-free view of what's due, for pinning somewhere glanceable.
 *
 * iOS PWAs can't publish a real home-screen widget, but this URL can be
 * saved as its own icon or opened from a Shortcut — same effect, one tap,
 * no navigation. So it renders deadlines and nothing else: no nav bar, no
 * greeting, no cards you'd want to tap through to.
 *
 * Anything that isn't the answer is noise at this size, which is why it
 * doesn't reuse the dashboard card.
 */
export default function Widget() {
  const tone = useTone();

  /**
   * Point the manifest at the widget's own while this route is open.
   *
   * There is one index.html, so without this iOS saves the page under
   * the app's manifest — same name, same icon — and the home screen ends
   * up with two identical AcadKits. iOS reads the manifest at Add to
   * Home Screen time from whatever the live document says, so swapping
   * the href is enough. Restored on unmount so a normal install is
   * unaffected.
   */
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!link) return;
    const original = link.href;
    link.href = "/widget.webmanifest";
    return () => {
      link.href = original;
    };
  }, []);
  const { data: deadlines } = useDeadlines();
  const { data: subjects } = useSubjects();

  const upcoming = useMemo(() => {
    const now = Date.now() - 1000 * 60 * 60 * 24; // today's still count
    return (deadlines ?? [])
      .filter((d) => d.status === "pending" && new Date(d.due_date).getTime() > now)
      .sort((a, b) => a.due_date.localeCompare(b.due_date))
      .slice(0, 6);
  }, [deadlines]);

  return (
    <div className="min-h-dvh px-5 pb-safe-b pt-safe-t">
      <div className="mx-auto max-w-md py-6">
        <p className="text-xs font-bold uppercase tracking-widest text-muted">
          {say(VOICE.titleWidget, tone)}
        </p>

        {upcoming.length === 0 ? (
          <p className="mt-6 text-lg font-bold text-muted">
            {say(VOICE.deadlinesEmptyTitle, tone)}
          </p>
        ) : (
          <ul className="mt-4 space-y-2.5">
            {upcoming.map((d) => {
              const subject = subjects?.find((s) => s.id === d.subject_id);
              const days = Math.ceil((new Date(d.due_date).getTime() - Date.now()) / 86_400_000);
              const urgent = days <= 2;
              return (
                <li
                  key={d.id}
                  className="flex items-center gap-3 rounded-2xl border bg-surface-2/40 p-3.5"
                >
                  {subject && <Dot color={subject.color_hex} className="shrink-0" />}
                  <span className="min-w-0 flex-1 truncate text-sm font-bold">
                    {deadlineLabel(d, subject)}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 text-xs font-bold",
                      urgent ? "text-bad-deep" : "text-muted"
                    )}
                  >
                    {days <= 0 ? "today" : days === 1 ? "tomorrow" : `${days}d`}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        <a
          href="/"
          className="mt-6 flex items-center justify-center gap-2 text-xs font-semibold text-muted"
        >
          <CalendarCheck2 className="h-3.5 w-3.5" />
          open AcadKit
        </a>
      </div>
    </div>
  );
}
