import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarClock, Share2 } from "lucide-react";
import { Badge, EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { useTone } from "@/hooks/useTone";
import { computeOverallAttendance } from "@/lib/attendance";
import { formatDate, todayISO } from "@/lib/dates";
import { renderSurvivalCard, shareCard } from "@/lib/shareCard";
import { buildSurvivalPlan } from "@/lib/survival";
import { say, VOICE } from "@/lib/voice";
import { cn } from "@/lib/utils";
import type {
  AttendanceRecord,
  PortalSnapshot,
  Subject,
  TimetableSlot,
} from "@/types";

export function SurvivalPlan({
  subjects,
  attendance,
  snapshots,
  timetable,
  effMap,
}: {
  subjects: Subject[];
  attendance: AttendanceRecord[];
  snapshots: PortalSnapshot[];
  timetable: TimetableSlot[];
  effMap: Record<string, number>;
}) {
  const tone = useTone();
  const [sharing, setSharing] = useState(false);

  const plan = useMemo(() => {
    // Same shape computeOverallAttendance uses: records grouped by
    // subject, snapshots matched by code, so the portal baseline counts
    // here exactly as it does on the attendance page.
    const overall = computeOverallAttendance(subjects, attendance, snapshots);
    const states = overall.subjects.map((s) => ({
      subject: s.subject,
      attended: s.attended,
      held: s.total,
    }));
    return buildSurvivalPlan(states, timetable, effMap, todayISO());
  }, [subjects, attendance, snapshots, timetable, effMap]);

  if (!plan.days.length) {
    return (
      <EmptyState
        icon={CalendarClock}
        title="No classes left to plan"
        description="Add your timetable, or the semester is already over."
      />
    );
  }

  return (
    <div className="space-y-4">
      <section className="card space-y-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-bold">
            {say(VOICE.planIntro, tone, plan.freeDays.length, plan.days.length)}
          </p>
          <Button
            variant="secondary"
            size="sm"
            className="shrink-0"
            disabled={sharing}
            onClick={async () => {
              setSharing(true);
              try {
                const blob = await renderSurvivalCard({
                  headline: say(VOICE.planIntro, tone, plan.freeDays.length, plan.days.length),
                  freeDays: plan.freeDays.map((d) => formatDate(d)),
                  deadline: plan.firstRequiredDate
                    ? say(VOICE.planDeadline, tone, formatDate(plan.firstRequiredDate))
                    : null,
                  lost: plan.lost.map((s) => s.code),
                  footer: `AcadKit · ${formatDate(todayISO())}`,
                });
                const how = await shareCard(blob, "survival-plan.png");
                toast.success(how === "shared" ? "Shared" : "Image saved");
              } catch (err) {
                toast.error((err as Error)?.message ?? "Couldn't create the image");
              } finally {
                setSharing(false);
              }
            }}
          >
            <Share2 className="h-4 w-4" />
            {sharing ? "Rendering…" : "Share"}
          </Button>
        </div>
        <p className="text-sm font-semibold text-warn-deep">
          {plan.firstRequiredDate
            ? say(VOICE.planDeadline, tone, formatDate(plan.firstRequiredDate))
            : say(VOICE.planNoDeadline, tone)}
        </p>
        {plan.lost.length > 0 && (
          <p className="text-sm font-semibold text-bad-deep">
            {say(VOICE.planLost, tone, plan.lost.length)}{" "}
            <span className="font-mono text-xs">
              {plan.lost.map((s) => s.code).join(", ")}
            </span>
          </p>
        )}
      </section>

      <div className="space-y-2">
        {plan.days.slice(0, 30).map((day) => (
          <section
            key={day.date}
            className={cn(
              "card flex items-center gap-3 p-3.5",
              day.free && "border-good/40 bg-good/[0.06]"
            )}
          >
            <div className="w-16 shrink-0">
              <p className="text-sm font-extrabold tabular">{formatDate(day.date)}</p>
              <p className="text-[11px] font-semibold text-muted">Day {day.dayOrder}</p>
            </div>

            <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
              {day.classes.map((c) => (
                <Badge
                  key={c.slot.id}
                  className={cn(
                    "font-mono",
                    c.required ? "bg-bad/12 text-bad-deep" : "bg-surface-2 text-muted line-through"
                  )}
                >
                  {c.subject.code.slice(-4)}
                </Badge>
              ))}
            </div>

            <span
              className={cn(
                "shrink-0 text-[11px] font-bold",
                day.free ? "text-good-deep" : "text-bad-deep"
              )}
            >
              {day.free ? say(VOICE.dayFree, tone) : say(VOICE.dayRequired, tone, day.requiredCount)}
            </span>
          </section>
        ))}
      </div>
    </div>
  );
}