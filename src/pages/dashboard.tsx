import {
  AlertTriangle,
  BookOpen,
  Check,
  CheckCircle2,
  Clock3,
  ClipboardList,
  Plus,
  Settings,
  Share2,
} from "lucide-react";
import { useMemo, useState, type ComponentType } from "react";
import { Link } from "react-router-dom";
import { DeadlineSheet } from "@/components/deadlines/DeadlineSheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAttendanceStats,
  useMarkAttendance,
  useTodayAttendance,
  type TodaySlotAttendance,
} from "@/hooks/useAttendance";
import { useToggleDeadline, useUpcomingDeadlines } from "@/hooks/useDeadlines";
import { useMarks } from "@/hooks/useMarks";
import { useTodaySlots } from "@/hooks/useTimetable";
import {
  SEM_START,
  daysUntilSemesterStart,
  getTodayStatus,
} from "@/lib/academicCalendar";
import { computeOverallAttendance, getLocalDateString } from "@/lib/attendance";
import { formatTime } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/useAppStore";
import { useToast } from "@/components/ui/toast";
import type { Deadline, Subject } from "@/types/database";

function greeting() {
  const name = localStorage.getItem("ACADKIT_USER_NAME");
  const suffix = name ? `, ${name}` : "";
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return `Good morning${suffix}`;
  if (hour >= 12 && hour < 17) return `Good afternoon${suffix}`;
  if (hour >= 17 && hour < 22) return `Good evening${suffix}`;
  return `Good night${suffix}`;
}

function formatLongDate(date = new Date()) {
  return date.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function daysLabel(deadline: Deadline) {
  const today = new Date(getLocalDateString());
  const due = new Date(deadline.due_date.split("T")[0]);
  const diff = Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
  if (diff < 0) return { text: `${Math.abs(diff)}d overdue`, tone: "text-[#fb7185]" };
  if (diff === 0) return { text: "Due Today", tone: "text-[#fb7185]" };
  if (diff === 1) return { text: "Tomorrow", tone: "text-amber-300" };
  if (diff <= 7) return { text: `${diff} days`, tone: "text-[#facc15]" };
  return {
    text: due.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
    tone: "text-muted-foreground",
  };
}

function activeSlot(startTime: string, endTime: string) {
  const now = new Date();
  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);
  const start = new Date(now);
  start.setHours(startHour ?? 0, startMinute ?? 0, 0, 0);
  const end = new Date(now);
  end.setHours(endHour ?? 0, endMinute ?? 0, 0, 0);
  if (now >= start && now <= end) return "now";
  if (now > end) return "past";
  return "upcoming";
}

export default function DashboardPage() {
  const [deadlineOpen, setDeadlineOpen] = useState(false);
  const subjects = useAppStore((state) => state.subjects);
  const settings = useAppStore((state) => state.settings);
  const declared = settings?.declared_holidays ?? [];
  const todayStatus = getTodayStatus(declared);
  const todaySlots = useTodaySlots();
  const todayAttendance = useTodayAttendance();
  const stats = useAttendanceStats();
  const upcoming = useUpcomingDeadlines(5);
  const { data: allMarks = [] } = useMarks();
  const totalObtained = allMarks.reduce((s, m) => s + m.marks_obtained, 0);
  const totalMax = allMarks.reduce((s, m) => s + m.max_marks, 0);
  const marksValue = totalMax > 0 ? `${totalObtained}/${totalMax}` : "—";
  const markAttendance = useMarkAttendance();

  const overall = useMemo(() => computeOverallAttendance(stats), [stats]);
  const { toast } = useToast();
  const atRisk = stats.filter((item) => item.percentage < 75);
  const unmarkedSlots = todayAttendance.filter((item) => item.status === "unmarked");
  const pendingCount = upcoming.data.length;
  const activeDay =
    !todayStatus.isWeekend &&
    !todayStatus.isHoliday &&
    !todayStatus.isPreSemester &&
    !todayStatus.isPostSemester &&
    todayStatus.dayOrder !== null;

  const markSlot = (item: TodaySlotAttendance, status: "present" | "absent") => {
    markAttendance.mutate({
      subject_id: item.slot.subject_id,
      date: getLocalDateString(),
      status,
      start_time: item.slot.start_time,
      end_time: item.slot.end_time,
    }, {
      onSuccess: () => toast(`Marked ${status}`),
      onError: () => toast("Failed to mark attendance. Try again."),
    });
  };

  const markAll = (status: "present" | "absent") => {
    const today = getLocalDateString();
    for (const slot of todaySlots) {
      markAttendance.mutate({
        subject_id: slot.subject_id,
        date: today,
        status,
        start_time: slot.start_time,
        end_time: slot.end_time,
      });
    }
    toast(`All ${todaySlots.length} classes marked ${status}`);
  };

  return (
    <main className="min-h-screen bg-background pb-24">
      <div className="space-y-5 px-4 py-5">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-syne text-2xl font-bold text-foreground">
              {greeting()}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatLongDate()}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <DayStatusBadge status={todayStatus} />
            <div className="flex items-center gap-1.5">
              <Link
                to="/log"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#1e1e2e] text-muted-foreground hover:border-[#7c6af7]/40 hover:text-[#7c6af7]"
                aria-label="Activity Log"
              >
                <ClipboardList className="h-4 w-4" />
              </Link>
              <Link
                to="/settings"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#1e1e2e] text-muted-foreground hover:border-[#7c6af7]/40 hover:text-[#7c6af7]"
                aria-label="Settings"
              >
                <Settings className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-3">
          {upcoming.isLoading ? (
            <>
              <Skeleton className="h-24 rounded-lg" />
              <Skeleton className="h-24 rounded-lg" />
              <Skeleton className="h-24 rounded-lg" />
              <Skeleton className="h-24 rounded-lg" />
            </>
          ) : (
            <>
              <StatCard
                icon={CheckCircle2}
                value={`${overall.percentage}%`}
                label="Attendance"
                color={
                  overall.percentage >= 75
                    ? "#4ade80"
                    : overall.percentage >= 65
                      ? "#facc15"
                      : "#fb7185"
                }
              />
              <StatCard
                icon={BookOpen}
                value={marksValue}
                label="Marks"
                color="#7c6af7"
              />
              <StatCard
                icon={Clock3}
                value={String(pendingCount)}
                label="Pending"
                color={pendingCount > 0 ? "#f97316" : "#6b6b8a"}
              />
              <StatCard
                icon={AlertTriangle}
                value={String(atRisk.length)}
                label="At Risk"
                color={atRisk.length > 0 ? "#fb7185" : "#4ade80"}
              />
            </>
          )}
        </section>

        <section className="rounded-lg border border-[#1e1e2e] bg-[#111118] p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-syne text-lg font-semibold">Today's Classes</h2>
            <Link to="/attendance" className="text-xs font-medium text-[#c4b5fd]">
              Mark Attendance →
            </Link>
          </div>
          {activeDay && todaySlots.length > 0 && (
            <div className="mb-3 flex gap-2">
              <button
                type="button"
                onClick={() => markAll("present")}
                disabled={markAttendance.isPending}
                className="flex-1 rounded-md border border-[#4ade80]/30 bg-[#4ade80]/10 py-1.5 text-xs font-medium text-[#4ade80] transition-colors hover:bg-[#4ade80]/20 disabled:opacity-50"
              >
                ✓ All Present
              </button>
              <button
                type="button"
                onClick={() => markAll("absent")}
                disabled={markAttendance.isPending}
                className="flex-1 rounded-md border border-[#fb7185]/30 bg-[#fb7185]/10 py-1.5 text-xs font-medium text-[#fb7185] transition-colors hover:bg-[#fb7185]/20 disabled:opacity-50"
              >
                ✗ All Absent
              </button>
            </div>
          )}
          {todaySlots.length === 0 && upcoming.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 rounded-md" />
              <Skeleton className="h-10 rounded-md" />
              <Skeleton className="h-10 rounded-md" />
            </div>
          ) : (
            <TodaySchedule status={todayStatus} slots={todaySlots} />
          )}
        </section>

        {atRisk.length > 0 && (
          <section>
            <h2 className="mb-3 font-syne text-lg font-semibold">
              Attendance Alerts
            </h2>
            <div className="space-y-2">
              {atRisk.map((item) => (
                <div
                  key={item.subjectId}
                  className={cn(
                    "rounded-lg border border-[#1e1e2e] bg-[#111118] p-3",
                    item.percentage < 65
                      ? "border-l-4 border-l-[#fb7185]"
                      : "border-l-4 border-l-[#facc15]"
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-syne text-sm font-semibold">
                      {item.subjectName}
                    </p>
                    <p className="font-mono text-sm text-[#fb7185]">
                      {item.percentage}%
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Attend {item.needToAttend} more classes to reach 75%
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="rounded-lg border border-[#1e1e2e] bg-[#111118] p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-syne text-lg font-semibold">Upcoming</h2>
            <Button
              size="sm"
              variant="outline"
              className="border-[#7c6af7]/40 text-[#c4b5fd]"
              onClick={() => setDeadlineOpen(true)}
            >
              <Plus className="h-4 w-4" />
              Add Deadline
            </Button>
          </div>
          {upcoming.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-14 rounded-md" />
              <Skeleton className="h-14 rounded-md" />
              <Skeleton className="h-14 rounded-md" />
            </div>
          ) : upcoming.data.length === 0 ? (
            <p className="py-4 text-center text-sm text-[#4ade80]/70">
              You're all caught up ✓
            </p>
          ) : (
            <div className="space-y-2">
              {upcoming.data.map((deadline) => (
                <DeadlineRow
                  key={deadline.id}
                  deadline={deadline}
                  subjects={subjects}
                />
              ))}
            </div>
          )}
        </section>

        {activeDay && unmarkedSlots.length > 0 && (
          <section className="rounded-lg border border-[#1e1e2e] bg-[#111118] p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-syne text-lg font-semibold">Quick Mark</h2>
              <Link to="/attendance" className="text-xs font-medium text-[#c4b5fd]">
                View All →
              </Link>
            </div>
            <div className="space-y-2">
              {unmarkedSlots.map((item) => (
                <div
                  key={item.slot.id}
                  className="grid grid-cols-[1fr_auto] gap-3 rounded-md bg-[#0a0a0f] p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-syne text-sm font-semibold">
                      {item.slot.subject.name}
                    </p>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      {formatTime(item.slot.start_time)} -{" "}
                      {formatTime(item.slot.end_time)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="border border-[#4ade80]/30 bg-[#4ade80]/10 text-[#4ade80]"
                      variant="outline"
                      disabled={markAttendance.isPending}
                      onClick={() => markSlot(item, "present")}
                    >
                      Present
                    </Button>
                    <Button
                      size="sm"
                      className="border border-[#fb7185]/30 bg-[#fb7185]/10 text-[#fb7185]"
                      variant="outline"
                      disabled={markAttendance.isPending}
                      onClick={() => markSlot(item, "absent")}
                    >
                      Absent
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <DeadlineSheet
        open={deadlineOpen}
        onClose={() => setDeadlineOpen(false)}
        subjects={subjects}
      />
    </main>
  );
}

function DayStatusBadge({
  status,
}: {
  status: ReturnType<typeof getTodayStatus>;
}) {
  if (status.isPreSemester) {
    return (
      <span className="whitespace-nowrap rounded-md bg-cyan-500/15 px-2 py-1 text-xs font-medium text-cyan-300">
        Sem starts in {daysUntilSemesterStart(status.todayStr)} days
      </span>
    );
  }
  if (status.isHoliday) {
    return (
      <span className="whitespace-nowrap rounded-md bg-amber-500/15 px-2 py-1 text-xs font-medium text-amber-300">
        {status.holidayName}
      </span>
    );
  }
  if (status.isWeekend) {
    return (
      <span className="whitespace-nowrap rounded-md bg-[#1e1e2e] px-2 py-1 text-xs font-medium text-[#6b6b8a]">
        Weekend
      </span>
    );
  }
  if (status.dayOrder) {
    return (
      <span className="whitespace-nowrap rounded-md bg-[#7c6af7]/20 px-2 py-1 text-xs font-medium text-[#c4b5fd]">
        Day {status.dayOrder}
      </span>
    );
  }
  return null;
}

function StatCard({
  icon: Icon,
  value,
  label,
  color,
}: {
  icon: ComponentType<{ className?: string; style?: React.CSSProperties }>;
  value: string;
  label: string;
  color: string;
}) {
  return (
    <div className="rounded-lg border border-[#1e1e2e] bg-[#111118] p-4">
      <Icon className="mb-3 h-5 w-5" style={{ color }} />
      <p className="font-mono text-2xl font-bold" style={{ color }}>
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function TodaySchedule({
  status,
  slots,
}: {
  status: ReturnType<typeof getTodayStatus>;
  slots: ReturnType<typeof useTodaySlots>;
}) {
  if (status.isPreSemester) {
    return (
      <p className="py-5 text-center text-sm text-cyan-200/80">
        Semester starts on {new Date(SEM_START).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })}
      </p>
    );
  }
  if (status.isWeekend) {
    return <p className="py-5 text-center text-sm text-muted-foreground">Weekend - no classes today</p>;
  }
  if (status.isHoliday) {
    return (
      <p className="py-5 text-center text-sm text-amber-200/80">
        {status.holidayName} - holiday
      </p>
    );
  }
  if (slots.length === 0) {
    return (
      <p className="py-5 text-center text-sm text-muted-foreground">
        No classes today for Day {status.dayOrder}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {slots.map((slot) => {
        const slotState = activeSlot(slot.start_time, slot.end_time);
        return (
          <div
            key={slot.id}
            className={cn(
              "grid grid-cols-[78px_auto_1fr_auto] items-center gap-2 rounded-md px-3 py-2",
              slotState === "now" ? "bg-[#7c6af7]/15" : "bg-[#0a0a0f]",
              slotState === "past" && "opacity-40"
            )}
          >
            <span className="font-mono text-[11px] text-muted-foreground">
              {formatTime(slot.start_time)}-{formatTime(slot.end_time)}
            </span>
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: slot.subject.color_hex }}
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-sm text-foreground">
                  {slot.subject.name}
                </p>
                <span className={cn(
                  "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                  slot.slot_type === "lab"
                    ? "bg-cyan-500/20 text-cyan-300"
                    : "bg-[#7c6af7]/20 text-[#7c6af7]"
                )}>
                  {slot.slot_type === "lab" ? "Lab" : "T"}
                </span>
              </div>
              {slot.room && (
                <p className="text-[11px] text-muted-foreground">{slot.room}</p>
              )}
            </div>
            {slotState === "now" && (
              <span className="rounded bg-[#7c6af7] px-1.5 py-0.5 font-mono text-[10px] text-white">
                NOW
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DeadlineRow({
  deadline,
  subjects,
}: {
  deadline: Deadline;
  subjects: Subject[];
}) {
  const remaining = daysLabel(deadline);
  const subject = deadline.subject_id
    ? subjects.find((item) => item.id === deadline.subject_id)
    : null;
  const toggle = useToggleDeadline();
  const { toast } = useToast();
  const isDone = deadline.status === "done";

  const handleShare = async () => {
    if (!navigator.share) return;
    const due = new Date(deadline.due_date).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
    });
    await navigator.share({
      title: deadline.title,
      text: `${deadline.title} (${deadline.type}) — due ${due}${subject ? ` · ${subject.name}` : ""}`,
    }).catch(() => null);
  };

  return (
    <div
      className={cn(
        "grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-md bg-[#0a0a0f] p-3",
        isDone && "opacity-60"
      )}
    >
      <button
        type="button"
        onClick={() =>
          toggle.mutate(deadline, {
            onSuccess: (updated) => {
              toast(
                updated.status === "done"
                  ? `✓ ${updated.title} completed`
                  : `${updated.title} marked pending`
              );
            },
          })
        }
        aria-label={`Mark ${deadline.title} ${isDone ? "pending" : "done"}`}
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
          isDone
            ? "border-[#4ade80] bg-[#4ade80] text-black"
            : "border-[#1e1e2e] bg-transparent"
        )}
      >
        {isDone && <Check className="h-3 w-3" strokeWidth={3} />}
      </button>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p
            className={cn(
              "truncate text-sm font-medium",
              isDone && "line-through"
            )}
          >
            {deadline.title}
          </p>
          <span className="rounded bg-[#1e1e2e] px-1.5 py-0.5 text-[10px] capitalize text-muted-foreground">
            {deadline.type}
          </span>
        </div>
        {subject && (
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {subject.name}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className={cn("shrink-0 font-mono text-xs", remaining.tone)}>
          {remaining.text}
        </span>
        {typeof navigator.share === "function" && (
          <button
            type="button"
            onClick={handleShare}
            aria-label={`Share ${deadline.title}`}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
          >
            <Share2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
