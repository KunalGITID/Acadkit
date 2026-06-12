import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  CalendarCheck2,
  Clock3,
  PartyPopper,
  Plus,
  Sunrise,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Dot, EmptyState, Skeleton } from "@/components/ui/misc";
import { ProgressRing } from "@/components/viz/progress-ring";
import { AnimatedNumber } from "@/components/viz/animated-number";
import { SlotMarkRow } from "@/components/sheets/slot-mark-row";
import { DeadlineSheet } from "@/components/sheets/deadline-sheet";
import { useAttendance, useDeadlines, useSubjects, useUpdateDeadline } from "@/hooks/useData";
import { useToday } from "@/hooks/useToday";
import { attendanceColor, computeOverallAttendance } from "@/lib/attendance";
import { daysUntilSemesterStart } from "@/lib/calendar";
import { formatDateLong } from "@/lib/dates";
import { cn, haptic } from "@/lib/utils";
import type { Deadline } from "@/types";

const stagger = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 260, damping: 26, delay: i * 0.06 },
  }),
};

function TodayCard() {
  const { date, info, slots } = useToday();

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between border-b px-5 py-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-muted">Today</p>
          <h2 className="mt-0.5 text-lg font-extrabold">{formatDateLong(date)}</h2>
        </div>
        {info.dayOrder !== null && (
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 18 }}
            className="flex h-14 w-14 flex-col items-center justify-center rounded-2xl bg-accent text-white shadow-pop"
          >
            <span className="text-[9px] font-bold uppercase leading-none opacity-80">Day</span>
            <span className="text-2xl font-extrabold leading-tight">{info.dayOrder}</span>
          </motion.div>
        )}
      </div>

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
          <div className="space-y-2.5">
            <p className="px-1 text-xs font-semibold text-muted">
              Tap to mark today's attendance — tap again to clear
            </p>
            {slots.map(({ slot, subject }) => (
              <SlotMarkRow key={slot.id} slot={slot} subject={subject} date={date} />
            ))}
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
  const hour = new Date().getHours();
  const greeting = hour < 5 ? "Burning the midnight oil" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-4">
      <motion.h1
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="px-1 text-2xl font-extrabold tracking-tight lg:text-3xl"
      >
        {greeting} <span className="align-middle">👋</span>
      </motion.h1>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <TodayCard />
        </div>
        <div className="space-y-4 lg:col-span-2">
          <AttendanceHealthCard />
          <DeadlinesCard />
        </div>
      </div>
    </div>
  );
}
