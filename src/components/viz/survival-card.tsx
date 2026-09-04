import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CalendarClock } from "lucide-react";
import { buildSurvivalPlan } from "@/lib/survival";
import { computeOverallAttendance } from "@/lib/attendance";
import { buildEffectiveMap, semesterWindow } from "@/lib/calendar";
import { formatDate, todayISO } from "@/lib/dates";
import { say, VOICE } from "@/lib/voice";
import { useTone } from "@/hooks/useTone";
import {
  useAttendance,
  usePortalSnapshots,
  useSettings,
  useSubjects,
  useTimetable,
} from "@/hooks/useData";

/** Free days worth naming before the list turns into a calendar. */
const SHOWN = 3;

/**
 * The survival plan's headline, on the dashboard.
 *
 * `survival.ts` computes the best answer the app has — which specific
 * days you can take off and still finish every subject above 75% — and
 * it lived two taps deep in Insights, behind a tab. The question it
 * answers ("can I skip Thursday?") is a daily one, so the answer belongs
 * where you already are.
 *
 * This is a summary, not a second copy of the plan: the next few free
 * dates and the day the slack runs out. The full per-class breakdown
 * stays in Insights, one tap away.
 */
export function SurvivalCard() {
  const tone = useTone();
  const { data: subjects } = useSubjects();
  const { data: attendance } = useAttendance();
  const { data: snapshots } = usePortalSnapshots();
  const { data: timetable } = useTimetable();
  const { data: settings } = useSettings();

  const semStart = settings?.sem_start ?? null;
  const semEnd = settings?.sem_end ?? null;

  const plan = useMemo(() => {
    if (!subjects?.length || !timetable?.length) return null;
    const effMap = buildEffectiveMap(
      settings?.declared_holidays ?? [],
      semesterWindow({ sem_start: semStart, sem_end: semEnd })
    );
    // Same shape the Insights plan uses, so the two can't disagree: the
    // portal baseline counts here exactly as it does everywhere else.
    const overall = computeOverallAttendance(subjects, attendance ?? [], snapshots ?? []);
    const states = overall.subjects.map((s) => ({
      subject: s.subject,
      attended: s.attended,
      held: s.total,
    }));
    return buildSurvivalPlan(states, timetable, effMap, todayISO());
  }, [subjects, attendance, snapshots, timetable, settings?.declared_holidays, semStart, semEnd]);

  // Nothing left to plan is not a card worth showing — an empty state
  // here would just be a second empty state under the one on Today.
  if (!plan || !plan.days.length) return null;

  const next = plan.freeDays.slice(0, SHOWN);

  return (
    <Link to="/insights" className="card block p-5 transition-transform active:scale-[0.99]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted">
          {say(VOICE.survivalTitle, tone)}
        </p>
        <ArrowRight className="h-4 w-4 shrink-0 text-muted" />
      </div>

      {next.length > 0 ? (
        <p className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-lg font-extrabold">
          {next.map((d) => (
            <span key={d}>{formatDate(d, { weekday: "short", day: "numeric", month: "short" })}</span>
          ))}
        </p>
      ) : (
        <p className="mt-2 flex items-center gap-2 text-sm font-bold text-warn-deep">
          <CalendarClock className="h-4 w-4 shrink-0" />
          {say(VOICE.survivalFree, tone, 0)}
        </p>
      )}

      <p className="mt-1.5 text-xs font-medium text-muted">
        {say(VOICE.survivalFree, tone, plan.freeDays.length)}
      </p>

      {/* The date the slack runs out is the part that changes behaviour;
          the free days alone read as permission without a deadline. */}
      <p className="mt-3 border-t pt-3 text-xs font-semibold text-muted">
        {plan.firstRequiredDate
          ? say(
              VOICE.survivalCrunch,
              tone,
              formatDate(plan.firstRequiredDate, { weekday: "short", day: "numeric", month: "short" })
            )
          : say(VOICE.survivalClear, tone)}
      </p>
    </Link>
  );
}
