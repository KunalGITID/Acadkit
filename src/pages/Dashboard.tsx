import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  CalendarCheck2,
  Check,
  Clock3,
  PartyPopper,
  Plus,
  Sunrise,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Dot, EmptyState, Skeleton } from "@/components/ui/misc";
import { ProgressRing } from "@/components/viz/progress-ring";
import { AnimatedNumber } from "@/components/viz/animated-number";
import { GradeBadge } from "@/components/viz/grade-badge";
import { DeadlineSheet } from "@/components/sheets/deadline-sheet";
import { MarkDaySheet } from "@/components/sheets/mark-day-sheet";
import { DayOrderChip } from "@/components/layout/day-order-chip";
import {
  useAttendance,
  useDeadlines,
  useMarks,
  useSettings,
  useSubjects,
  useUpdateDeadline,
} from "@/hooks/useData";
import { useToday } from "@/hooks/useToday";
import { attendanceColor, computeOverallAttendance } from "@/lib/attendance";
import { daysUntilSemesterStart } from "@/lib/calendar";
import { formatDateLong, formatTimeRange } from "@/lib/dates";
import { computeSgpa, gradeForTotal, groupMarksBySubject } from "@/lib/grades";
import { cn, haptic } from "@/lib/utils";
import { useAppStore } from "@/store/app";
import type { Deadline } from "@/types";

const stagger = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 260, damping: 26, delay: i * 0.06 },
  }),
};

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

function TodayCard() {
  const { date, info, slots } = useToday();
  const { data: attendance } = useAttendance();
  const [markOpen, setMarkOpen] = useState(false);

  // Live clock for now/next/past styling
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const statusOf = (start: string, end: string) =>
    nowMin > toMin(end) ? "past" : nowMin >= toMin(start) ? "now" : "upcoming";
  const nextId = slots.find(({ slot }) => statusOf(slot.start_time, slot.end_time) === "upcoming")
    ?.slot.id;

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-widest text-muted">Today</p>
          <h2 className="mt-0.5 truncate text-lg font-extrabold">{formatDateLong(date)}</h2>
        </div>
        {info.dayOrder !== null && slots.length > 0 && (
          <Button size="sm" onClick={() => setMarkOpen(true)}>
            <CalendarCheck2 className="h-4 w-4" /> Mark today
          </Button>
        )}
      </div>

      <MarkDaySheet date={markOpen ? date : null} onClose={() => setMarkOpen(false)} />

      <div className="p-4">
        {info.kind === "pre-semester" ? (
          <EmptyState
            icon={Sunrise}
            title={`Semester starts in ${daysUntilSemesterStart(date)} days`}
            description="Set up your timetable now so day one is effortless."
            action={
              <Button variant="secondary" size="sm">
                <Link to="/timetable" className="flex items-center gap-1.5">
                  Build timetable <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            }
          />
        ) : info.kind === "weekend" ? (
          <EmptyState icon={PartyPopper} title="It's the weekend" description="No day order today. Recharge." />
        ) : info.kind === "official-holiday" || info.kind === "declared-holiday" ? (
          <EmptyState
            icon={PartyPopper}
            title={info.holidayName ?? "Holiday"}
            description="No classes today — enjoy the break."
          />
        ) : info.kind === "post-semester" ? (
          <EmptyState icon={PartyPopper} title="Semester's over" description="See you next term." />
        ) : slots.length === 0 ? (
          <EmptyState
            icon={Clock3}
            title={`Nothing scheduled for Day Order ${info.dayOrder}`}
            description="Add your classes for this day order in the Timetable tab."
            action={
              <Button variant="secondary" size="sm">
                <Link to="/timetable" className="flex items-center gap-1.5">
                  Add classes <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            }
          />
        ) : (
          <div className="space-y-2">
            {slots.map(({ slot, subject }) => {
              const st = statusOf(slot.start_time, slot.end_time);
              const isNow = st === "now";
              const isNext = slot.id === nextId;
              const record = attendance?.find(
                (r) =>
                  r.subject_id === slot.subject_id &&
                  r.date === date &&
                  r.start_time === slot.start_time
              );
              return (
                <motion.div
                  key={slot.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: st === "past" ? 0.5 : 1, y: 0 }}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-2xl border bg-surface-2/40 p-3",
                    isNow && "ring-2 ring-accent",
                    isNext && "ring-1 ring-accent/30"
                  )}
                  style={isNow ? { boxShadow: "0 0 0 4px hsl(var(--accent) / 0.12)" } : undefined}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Dot color={subject?.color_hex ?? "#888"} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">
                        {subject?.name ?? "Unknown subject"}
                      </p>
                      <p className="truncate text-xs font-medium text-muted">
                        {slot.slot_type === "lab" ? "Lab · " : ""}
                        {formatTimeRange(slot.start_time, slot.end_time)}
                        {slot.room ? ` · ${slot.room}` : ""}
                      </p>
                    </div>
                  </div>
                  {record?.status === "present" ? (
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-good/15 text-good-deep">
                      <Check className="h-4 w-4" strokeWidth={2.6} />
                    </span>
                  ) : record?.status === "absent" ? (
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-bad/15 text-bad-deep">
                      <X className="h-4 w-4" strokeWidth={2.6} />
                    </span>
                  ) : record?.status === "holiday" ? (
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-muted">
                      <Ban className="h-4 w-4" />
                    </span>
                  ) : isNow ? (
                    <Badge className="animate-pulse bg-accent text-white">now</Badge>
                  ) : isNext ? (
                    <Badge className="bg-accent/15 text-accent">next</Badge>
                  ) : null}
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function AttendanceHealthCard() {
  const { data: subjects, isLoading: sLoading } = useSubjects();
  const { data: attendance, isLoading: aLoading } = useAttendance();

  const overall = useMemo(
    () => computeOverallAttendance(subjects ?? [], attendance ?? []),
    [subjects, attendance]
  );

  if (sLoading || aLoading) return <Skeleton className="h-44 w-full" />;

  const pct = overall.percentage;

  return (
    <Link to="/attendance" className="card block p-5 transition-transform active:scale-[0.99]">
      <div className="flex items-center gap-5">
        <ProgressRing
          value={pct ?? 0}
          size={104}
          strokeWidth={11}
          color={attendanceColor(pct)}
        >
          {pct === null ? (
            <span className="text-sm font-bold text-muted">—</span>
          ) : (
            <span className="text-xl font-extrabold tabular">
              <AnimatedNumber value={pct} decimals={0} suffix="%" />
            </span>
          )}
        </ProgressRing>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-widest text-muted">Attendance</p>
            <ArrowRight className="h-4 w-4 text-muted" />
          </div>
          {pct === null ? (
            <p className="mt-1.5 text-sm font-semibold text-muted">
              Nothing marked yet — start with today's classes.
            </p>
          ) : overall.below75.length === 0 ? (
            <p className="mt-1.5 text-sm font-semibold text-good-deep">
              All subjects are at or above 75%. Keep it up.
            </p>
          ) : (
            <div className="mt-1.5 space-y-1">
              <p className="flex items-center gap-1.5 text-sm font-bold text-bad-deep">
                <AlertTriangle className="h-4 w-4" />
                {overall.below75.length} subject{overall.below75.length > 1 ? "s" : ""} below 75%
              </p>
              <div className="flex flex-wrap gap-1.5">
                {overall.below75.slice(0, 3).map((s) => (
                  <Badge
                    key={s.subject.id}
                    className="bg-bad/10 text-bad-deep"
                  >
                    {s.subject.code.slice(-4)} · {Math.round(s.percentage ?? 0)}%
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

function MarksSummaryCard() {
  const { data: subjects, isLoading: sLoading } = useSubjects();
  const { data: marks, isLoading: mLoading } = useMarks();

  const result = useMemo(
    () => computeSgpa(subjects ?? [], groupMarksBySubject(marks ?? [])),
    [subjects, marks]
  );

  if (sLoading || mLoading) return <Skeleton className="h-28 w-full" />;

  const hasMarks = result.totalMax > 0;
  const pace = hasMarks ? (result.totalObtained / result.totalMax) * 100 : 0;

  return (
    <Link to="/marks" className="card block p-5 transition-transform active:scale-[0.99]">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-widest text-muted">Marks</p>
        <ArrowRight className="h-4 w-4 text-muted" />
      </div>
      {!hasMarks ? (
        <p className="mt-2 text-sm font-semibold text-muted">
          No internals yet — add your first CT to see totals here.
        </p>
      ) : (
        <div className="mt-2 flex items-end justify-between gap-3">
          <div>
            <p className="text-3xl font-extrabold tabular leading-none">
              <AnimatedNumber value={result.totalObtained} decimals={0} />
              <span className="text-base font-bold text-muted"> / {result.totalMax}</span>
            </p>
            <p className="mt-1.5 text-xs font-semibold text-muted">internals so far</p>
          </div>
          <div className="flex items-center gap-2.5">
            {result.sgpa !== null && (
              <div className="text-right">
                <p className="text-lg font-extrabold tabular leading-none accent-gradient-text">
                  <AnimatedNumber value={result.sgpa} decimals={2} />
                </p>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-muted">
                  pred. SGPA
                </p>
              </div>
            )}
            <GradeBadge grade={gradeForTotal(pace).grade} />
          </div>
        </div>
      )}
    </Link>
  );
}

function DeadlinesCard() {
  const { data: deadlines, isLoading } = useDeadlines();
  const { data: subjects } = useSubjects();
  const updateDeadline = useUpdateDeadline();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Deadline | null>(null);

  const upcoming = useMemo(() => {
    const now = Date.now() - 1000 * 60 * 60 * 24; // keep today's even if past time
    return (deadlines ?? [])
      .filter((d) => d.status === "pending" && new Date(d.due_date).getTime() > now)
      .slice(0, 5);
  }, [deadlines]);

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  return (
    <section className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-widest text-muted">Upcoming deadlines</p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setEditing(null);
            setSheetOpen(true);
          }}
        >
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>

      {upcoming.length === 0 ? (
        <EmptyState
          icon={CalendarCheck2}
          title="Nothing due"
          description="Add assignments and exams so they can't sneak up on you."
          className="py-6"
        />
      ) : (
        <div className="space-y-2">
          {upcoming.map((d, i) => {
            const subject = subjects?.find((s) => s.id === d.subject_id);
            const due = new Date(d.due_date);
            const days = Math.ceil((due.getTime() - Date.now()) / 86_400_000);
            const urgent = days <= 2;
            return (
              <motion.div
                key={d.id}
                custom={i}
                variants={stagger}
                initial="hidden"
                animate="show"
                className="flex items-center gap-3 rounded-2xl border bg-surface-2/40 p-3"
              >
                <button
                  aria-label={`Mark ${d.title} done`}
                  onClick={() => {
                    haptic([10, 40, 14]);
                    updateDeadline.mutate({ id: d.id, patch: { status: "done" } });
                  }}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-ink/20 transition-colors hover:border-good hover:bg-good/15"
                />
                <button
                  className="min-w-0 flex-1 text-left"
                  onClick={() => {
                    setEditing(d);
                    setSheetOpen(true);
                  }}
                >
                  <p className="truncate text-sm font-bold">{d.title}</p>
                  <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
                    {subject && (
                      <>
                        <Dot color={subject.color_hex} className="h-1.5 w-1.5" />
                        <span className="truncate">{subject.code}</span> ·
                      </>
                    )}
                    <span className={cn(urgent && "font-bold text-bad-deep")}>
                      {days <= 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`}
                    </span>
                  </p>
                </button>
                <Badge
                  className={cn(
                    d.type === "exam" ? "bg-bad/10 text-bad-deep" : "bg-accent/10 text-accent"
                  )}
                >
                  {d.type}
                </Badge>
              </motion.div>
            );
          })}
        </div>
      )}

      <DeadlineSheet open={sheetOpen} onClose={() => setSheetOpen(false)} deadline={editing} />
    </section>
  );
}

export default function Dashboard() {
  const { data: settings } = useSettings();
  const localName = useAppStore((s) => s.name);
  const name = (settings?.name || localName || "").trim();

  const hour = new Date().getHours();
  const greeting =
    hour < 5
      ? "Burning the midnight oil"
      : hour < 12
        ? "Good morning"
        : hour < 17
          ? "Good afternoon"
          : "Good evening";

  return (
    <div className="space-y-4">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between gap-3 px-1"
      >
        <h1 className="min-w-0 truncate text-2xl font-extrabold tracking-tight lg:text-3xl">
          {greeting}
          {name ? `, ${name}` : ""}
        </h1>
        <DayOrderChip />
      </motion.div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <TodayCard />
        </div>
        <div className="space-y-4 lg:col-span-2">
          <AttendanceHealthCard />
          <MarksSummaryCard />
          <DeadlinesCard />
        </div>
      </div>
    </div>
  );
}
