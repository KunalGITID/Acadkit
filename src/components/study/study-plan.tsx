import { useMemo, useState } from "react";
import { CalendarClock, ChevronDown, Moon } from "lucide-react";
import { Dot } from "@/components/ui/misc";
import { Segmented } from "@/components/ui/segmented";
import {
  useAttendance,
  useDeadlines,
  useMarks,
  usePortalSnapshots,
  useSettings,
  useSubjects,
  useTimetable,
  useUpdateSettings,
} from "@/hooks/useData";
import { semesterWindow } from "@/lib/calendar";
import { labelMatchKey } from "@/lib/componentLabel";
import { formatDate, formatTime, todayISO } from "@/lib/dates";
import { deadlineLabel } from "@/lib/deadlines";
import { gradeOdds } from "@/lib/odds";
import { formatPrep, prepWindows } from "@/lib/prep";
import { buildProjection } from "@/lib/projections";
import { buildStudyPlan, EVENING_START, type PlanTest } from "@/lib/studyPlan";
import { cn } from "@/lib/utils";
import type { Deadline } from "@/types";

/** Tests further out than this aren't planned yet: the plan is for the next two weeks. */
const HORIZON_DAYS = 14;
/** What a test with no marks value is taken to be worth. */
const DEFAULT_STAKE: Record<Deadline["type"], number> = { exam: 10, lab: 3, assignment: 3, other: 2 };

const EVENINGS = [
  { value: 0, label: "Off" },
  { value: 60, label: "1h" },
  { value: 120, label: "2h" },
  { value: 180, label: "3h" },
];

function marks(n: number): string {
  return n >= 9.95 ? String(Math.round(n)) : n.toFixed(1);
}

/**
 * Which free hours to spend on which test (src/lib/studyPlan.ts).
 *
 * Folded to one line until opened, like Exam prep above it: it's read
 * when deciding what to do with a free period, not on every visit.
 */
export function StudyPlanCard() {
  const { data: settings } = useSettings();
  const { data: subjects } = useSubjects();
  const { data: deadlines } = useDeadlines();
  const { data: marksData } = useMarks();
  const { data: attendance } = useAttendance();
  const { data: timetable } = useTimetable();
  const { data: snapshots } = usePortalSnapshots();
  const updateSettings = useUpdateSettings();
  const [open, setOpen] = useState(false);
  const [now] = useState(() => new Date());

  const eveningMinutes = settings?.study_evening_minutes ?? 0;

  const planned = useMemo(() => {
    if (!subjects?.length || !deadlines?.length) return null;
    const today = todayISO();
    const window = semesterWindow(settings);
    const horizon = now.getTime() + HORIZON_DAYS * 86_400_000;
    const upcoming = deadlines.filter((d) => {
      const due = new Date(d.due_date).getTime();
      return d.status === "pending" && d.subject_id && due > now.getTime() && due <= horizon;
    });
    if (upcoming.length === 0) return null;

    const report = buildProjection(
      subjects,
      attendance ?? [],
      timetable ?? [],
      marksData ?? [],
      settings?.declared_holidays ?? [],
      today,
      window,
      settings?.target_sgpa ?? 8.5,
      deadlines,
      settings?.assumed_external_pct ?? null,
      snapshots ?? []
    );
    const odds = gradeOdds(report.gradeProjections, report.targetSgpa);
    const abilityById = new Map(odds.subjects.map((o) => [o.subjectId, o.ability]));
    const bySubject = new Map(report.gradeProjections.map((p) => [p.subject.id, p]));

    const tests: PlanTest[] = [];
    for (const d of upcoming) {
      const p = bySubject.get(d.subject_id!);
      if (!p) continue;
      // The component this test is — the deadline the plan adopted, or the
      // planned row it names — and what this sitting of it is worth.
      const title = labelMatchKey(d.title);
      const c =
        p.plan.components.find((x) => x.key === `deadline:${d.id}`) ??
        p.plan.components.find((x) => labelMatchKey(x.label) === title);
      if (c && c.obtained !== null) continue; // already marked
      const stake = c ? Math.min(c.max, d.max_marks ?? c.max) : (d.max_marks ?? DEFAULT_STAKE[d.type]);
      tests.push({
        id: d.id,
        subjectId: p.subject.id,
        label: c ? `${deadlineLabel(d, p.subject)} · ${c.label}` : deadlineLabel(d, p.subject),
        due: d.due_date,
        stake,
        ability: abilityById.get(p.subject.id) ?? p.paceRate ?? 0.7,
        credits: p.subject.credits,
      });
    }
    if (tests.length === 0) return null;

    const lastDue = tests.reduce((a, t) => (t.due > a ? t.due : a), tests[0].due);
    const windows = prepWindows({
      due: lastDue,
      from: today,
      fromMinutes: now.getHours() * 60 + now.getMinutes(),
      timetable: timetable ?? [],
      declared: settings?.declared_holidays ?? [],
      window,
    });
    return {
      tests,
      plan: buildStudyPlan({
        tests,
        windows,
        eveningMinutes,
        today,
        nowMinutes: now.getHours() * 60 + now.getMinutes(),
      }),
    };
  }, [subjects, deadlines, marksData, attendance, timetable, snapshots, settings, eveningMinutes, now]);

  if (!planned) return null;
  const { plan, tests } = planned;
  const testById = new Map(tests.map((t) => [t.id, t]));
  const colorOf = (subjectId: string) => subjects?.find((s) => s.id === subjectId)?.color_hex ?? "#888";
  const next = plan.sessions[0];
  const days = [...new Set(plan.sessions.map((s) => s.date))];

  return (
    <section className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="card flex w-full items-center gap-3 p-4 text-left"
      >
        <CalendarClock className="h-5 w-5 shrink-0 text-accent" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold">
            Study plan ·{" "}
            {plan.totalMinutes > 0
              ? `${formatPrep(plan.totalMinutes)} before ${tests.length} test${tests.length === 1 ? "" : "s"}`
              : "no free time found"}
          </span>
          <span className="block truncate text-xs font-medium text-muted">
            {next
              ? `Next: ${formatDate(next.date, { weekday: "short", day: "numeric", month: "short" })} ${next.start}–${next.end} · ${testById.get(next.testId)?.label}`
              : eveningMinutes === 0
                ? "No gaps between classes before these tests — allow some evening time"
                : "Nothing left to plan before these tests"}
          </span>
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="card space-y-4 p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-xs font-bold text-muted">
              <Moon className="h-3.5 w-3.5" /> Evenings, from {formatTime(EVENING_START)}
            </span>
            <Segmented
              layoutId="study-evenings"
              options={EVENINGS}
              value={eveningMinutes}
              onChange={(v) => updateSettings.mutate({ study_evening_minutes: v })}
              className="w-48 shrink-0"
            />
          </div>

          {days.map((date) => (
            <div key={date}>
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted">
                {formatDate(date, { weekday: "short", day: "numeric", month: "short" })}
              </p>
              <ul className="mt-1.5 space-y-1.5">
                {plan.sessions
                  .filter((s) => s.date === date)
                  .map((s) => {
                    const t = testById.get(s.testId)!;
                    return (
                      <li
                        key={`${s.date}-${s.start}`}
                        className="flex items-center gap-2 rounded-xl bg-surface-2/60 px-3 py-2 text-sm"
                      >
                        <span className="w-24 shrink-0 font-semibold tabular text-muted">
                          {s.start}–{s.end}
                        </span>
                        <Dot color={colorOf(t.subjectId)} className="h-1.5 w-1.5 shrink-0" />
                        <span className="min-w-0 flex-1 truncate font-semibold">{t.label}</span>
                        {s.evening && <Moon className="h-3 w-3 shrink-0 text-muted" aria-label="evening" />}
                      </li>
                    );
                  })}
              </ul>
            </div>
          ))}

          {plan.perTest.length > 0 && (
            <div className="space-y-1 border-t pt-3">
              {plan.perTest.map(({ test, minutes, gain }) => (
                <p key={test.id} className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="min-w-0 truncate font-semibold">
                    {test.label}{" "}
                    <span className="font-medium text-muted">
                      · {formatDate(test.due.slice(0, 10), { day: "numeric", month: "short" })}
                    </span>
                  </span>
                  <span className="shrink-0 font-bold tabular">
                    {formatPrep(minutes)} <span className="font-semibold text-muted">≈ +{marks(gain)}</span>
                  </span>
                </p>
              ))}
            </div>
          )}

          <p className="text-[11px] font-medium text-muted">
            Assumes each hour closes part of the gap between what you'd score anyway and full marks,
            less with every hour, and weights subjects by credits. Time goes where the next half
            hour is worth most. A starting point, not a timetable.
          </p>
        </div>
      )}
    </section>
  );
}
