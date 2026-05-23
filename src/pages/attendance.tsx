import { CalendarOff, Check, CheckCircle, Palmtree, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useSwipeTabs } from "@/hooks/useSwipeTabs";
import { AttendanceHeatmap } from "@/components/attendance/AttendanceHeatmap";
import { Button } from "@/components/ui/button";
import { CircularProgress } from "@/components/ui/circular-progress";
import { Collapsible } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import {
  useAttendance,
  useAttendanceStats,
  useMarkAttendance,
  useTodayAttendance,
  type MarkAttendanceInput,
  type TodaySlotAttendance,
} from "@/hooks/useAttendance";
import { useSubjects } from "@/hooks/useSubjects";
import { daysUntilSemesterStart, getTodayStatus } from "@/lib/academicCalendar";
import type { AttendanceStats } from "@/lib/attendance";
import {
  computeOverallAttendance,
  getAttendanceColor,
  getLocalDateString,
} from "@/lib/attendance";
import { formatTime } from "@/lib/constants";
import { useAppStore } from "@/store/useAppStore";
import type { Attendance, Subject } from "@/types/database";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type Tab = "overview" | "mark";
const TABS = ["overview", "mark"] as const satisfies readonly Tab[];

function statusBadgeClass(status: "safe" | "warning" | "danger") {
  if (status === "safe") return "bg-[#4ade80]/20 text-[#4ade80]";
  if (status === "warning") return "bg-[#facc15]/20 text-[#facc15]";
  return "bg-[#fb7185]/20 text-[#fb7185]";
}

function todayBlockReason(status: ReturnType<typeof getTodayStatus>): string {
  if (status.isPreSemester) {
    const days = daysUntilSemesterStart(status.todayStr);
    return `Semester begins July 21, 2026 · ${days} days to go`;
  }
  if (status.isPostSemester) return "Semester has ended";
  if (status.isWeekend) return "Weekend — no classes to mark";
  if (status.isHoliday && status.holidayName) {
    return `${status.holidayName} — holiday`;
  }
  return "No class day scheduled";
}

export default function AttendancePage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const swipe = useSwipeTabs(TABS, tab, setTab);

  useSubjects();
  const subjects = useAppStore((s) => s.subjects);
  const settings = useAppStore((s) => s.settings);
  const { toast } = useToast();

  const declared = settings?.declared_holidays ?? [];
  const todayStatus = getTodayStatus(declared);
  const todayStr = getLocalDateString();

  const stats = useAttendanceStats();
  const { data: allAttendance = [], isLoading: attendanceLoading } = useAttendance();
  const todaySlots = useTodayAttendance();
  const markAttendance = useMarkAttendance();

  const overall = useMemo(() => computeOverallAttendance(stats), [stats]);

  const formattedToday = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const canMarkToday =
    !todayStatus.isWeekend &&
    !todayStatus.isHoliday &&
    !todayStatus.isPreSemester &&
    !todayStatus.isPostSemester &&
    todayStatus.dayOrder !== null;

  const markSlot = (item: TodaySlotAttendance, status: MarkAttendanceInput["status"]) => {
    markAttendance.mutate({
      subject_id: item.slot.subject_id,
      date: todayStr,
      status,
      start_time: item.slot.start_time,
      end_time: item.slot.end_time,
    }, {
      onSuccess: () => toast(`Marked ${status}`),
    });
  };

  const markAll = async (status: "present" | "holiday") => {
    const targets =
      status === "present"
        ? todaySlots.filter((s) => s.status === "unmarked")
        : todaySlots;

    if (targets.length === 0) {
      toast("No slots to mark");
      return;
    }

    try {
      await Promise.all(
        targets.map((item) =>
          markAttendance.mutateAsync({
            subject_id: item.slot.subject_id,
            date: todayStr,
            status,
            start_time: item.slot.start_time,
            end_time: item.slot.end_time,
          })
        )
      );
      toast(
        status === "present"
          ? "All slots marked present"
          : "All slots marked holiday"
      );
    } catch {
      toast("Failed to mark some slots");
    }
  };

  return (
    <main
      className="min-h-screen bg-background pb-24"
      onTouchStart={swipe.onTouchStart}
      onTouchEnd={swipe.onTouchEnd}
    >
      <header className="sticky top-0 z-40 border-b border-[#1e1e2e] bg-background/95 px-4 pb-3 pt-4 backdrop-blur">
        <h1 className="font-syne text-xl font-bold text-foreground">
          Attendance
        </h1>
        <div className="mt-3 flex rounded-lg bg-[#111118] p-1">
          {(["overview", "mark"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "relative flex-1 rounded-md py-2 text-sm font-medium capitalize transition-all",
                tab === t
                  ? "text-[#7c6af7]"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t === "overview" ? "Overview" : "Mark Today"}
              {tab === t && (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-[#7c6af7]" />
              )}
            </button>
          ))}
        </div>
      </header>

      {tab === "overview" ? (
        <OverviewTab
          subjects={subjects}
          stats={stats}
          overall={overall}
          allAttendance={allAttendance}
          expandedId={expandedId}
          onExpand={setExpandedId}
          isLoading={attendanceLoading}
        />
      ) : (
        <MarkTodayTab
          todayStatus={todayStatus}
          formattedToday={formattedToday}
          canMarkToday={canMarkToday}
          todaySlots={todaySlots}
          markSlot={markSlot}
          markAll={markAll}
          markPending={markAttendance.isPending}
          allAttendance={allAttendance}
          subjects={subjects}
        />
      )}
    </main>
  );
}

function OverviewTab({
  subjects,
  stats,
  overall,
  allAttendance,
  expandedId,
  onExpand,
  isLoading,
}: {
  subjects: Subject[];
  stats: AttendanceStats[];
  overall: ReturnType<typeof computeOverallAttendance>;
  allAttendance: Attendance[];
  expandedId: string | null;
  onExpand: (id: string | null) => void;
  isLoading: boolean;
}) {
  if (subjects.length === 0) {
    return (
      <div className="flex flex-col items-center px-6 py-16 text-center">
        <CheckCircle className="mb-4 h-12 w-12 text-muted-foreground/40" />
        <p className="font-syne text-lg text-foreground">No subjects yet</p>
        <p className="mt-2 text-sm text-muted-foreground">Add subjects in Timetable → Manage</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-3 px-4 py-4">
        <Skeleton className="h-28 rounded-lg" />
        <Skeleton className="h-28 rounded-lg" />
        <Skeleton className="h-28 rounded-lg" />
      </div>
    );
  }

  const overallColor = getAttendanceColor(overall.percentage);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 px-4 py-4 duration-300">
      <div className="mb-4 rounded-lg border border-[#1e1e2e] bg-[#111118] p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Overall attendance</p>
            <p
              className="font-mono text-3xl font-bold"
              style={{ color: overallColor }}
            >
              {overall.percentage}%
            </p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              {overall.totalPresent} present out of {overall.totalClasses} classes
            </p>
            {overall.belowThreshold > 0 && (
              <p className="mt-1 text-xs text-[#fb7185]">
                {overall.belowThreshold} subject
                {overall.belowThreshold === 1 ? "" : "s"} below 75%
              </p>
            )}
          </div>
          <CircularProgress
            percentage={overall.percentage}
            size={88}
            color={overallColor}
          />
        </div>
      </div>

      <div className="space-y-3">
        {stats.map((stat) => {
          const isOpen = expandedId === stat.subjectId;
          const subject = subjects.find((s) => s.id === stat.subjectId);

          return (
            <div
              key={stat.subjectId}
              className="rounded-lg border border-[#1e1e2e] bg-[#111118] transition-colors hover:bg-[#1a1a2e]"
              style={{
                borderLeftWidth: 4,
                borderLeftColor: stat.colorHex,
              }}
            >
              <Collapsible
                open={isOpen}
                onOpenChange={(open) =>
                  onExpand(open ? stat.subjectId : null)
                }
                className="p-4"
                trigger={
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-syne font-semibold text-foreground">
                        {stat.subjectName}
                      </p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {subject?.code}
                      </p>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">
                        {stat.present} / {stat.total} classes
                        {stat.total === 0 && " · No classes marked yet"}
                      </p>
                    </div>
                    <CircularProgress percentage={stat.percentage} size={72} />
                    <div className="hidden w-24 shrink-0 text-right sm:block">
                      <span
                        className={cn(
                          "rounded px-2 py-0.5 text-[10px] font-bold",
                          statusBadgeClass(stat.status)
                        )}
                      >
                        {stat.status.toUpperCase()}
                      </span>
                      {stat.status === "safe" && stat.total > 0 && (
                        <p className="mt-1 text-[10px] text-[#4ade80]">
                          Can bunk {stat.canBunk} more
                        </p>
                      )}
                      {stat.status !== "safe" && stat.total > 0 && (
                        <p className="mt-1 text-[10px] text-[#fb7185]">
                          Attend {stat.needToAttend} more to reach 75%
                        </p>
                      )}
                    </div>
                  </div>
                }
              >
                <AttendanceHeatmap
                  subjectId={stat.subjectId}
                  records={allAttendance}
                />
              </Collapsible>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MarkTodayTab({
  todayStatus,
  formattedToday,
  canMarkToday,
  todaySlots,
  markSlot,
  markAll,
  markPending,
  allAttendance,
  subjects,
}: {
  todayStatus: ReturnType<typeof getTodayStatus>;
  formattedToday: string;
  canMarkToday: boolean;
  todaySlots: TodaySlotAttendance[];
  markSlot: (
    item: TodaySlotAttendance,
    status: MarkAttendanceInput["status"]
  ) => void;
  markAll: (status: "present" | "holiday") => void;
  markPending: boolean;
  allAttendance: Attendance[];
  subjects: Subject[];
}) {
  const [showPreview, setShowPreview] = useState(false);

  if (!canMarkToday) {
    return (
      <div className="px-4 py-6">
        <div className="flex flex-col items-center rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-6 py-10 text-center">
          <CalendarOff className="mb-4 h-12 w-12 text-cyan-400/70" />
          <p className="font-syne text-lg text-foreground">Nothing to mark</p>
          <p className="mt-2 text-sm text-cyan-200/80">
            {todayBlockReason(todayStatus)}
          </p>
        </div>

        <div className="mt-6">
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            className="w-full rounded-lg border border-[#7c6af7]/40 bg-[#7c6af7]/10 py-3 text-sm font-medium text-[#c4b5fd] transition-colors hover:bg-[#7c6af7]/20"
          >
            {showPreview ? "Hide preview" : "Preview Mark Today UI (sample)"}
          </button>
          {showPreview && <MarkTodayPreview />}
        </div>

        <div className="mt-6">
          <AbsentLogSection allAttendance={allAttendance} subjects={subjects} />
        </div>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 px-4 py-4 duration-300">
      <div className="mb-4 rounded-lg border border-[#7c6af7]/30 bg-[#7c6af7]/10 px-4 py-3">
        <p className="font-syne text-sm font-medium text-[#c4b5fd]">
          {formattedToday}
        </p>
        <p className="font-mono text-xs text-muted-foreground">
          Day {todayStatus.dayOrder} · Mark attendance per class
        </p>
      </div>

      {todaySlots.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-center">
          <p className="font-syne text-foreground">
            No classes scheduled for Day {todayStatus.dayOrder}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Add classes in Timetable tab
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {todaySlots.map((item) => (
              <SlotMarkRow
                key={item.slot.id}
                item={item}
                onMark={markSlot}
                disabled={markPending}
              />
            ))}
          </div>

          <div className="mt-6 flex gap-2">
            <Button
              className="flex-1 border border-[#4ade80]/30 bg-[#4ade80]/10 text-[#4ade80] hover:bg-[#4ade80]/20"
              variant="outline"
              onClick={() => markAll("present")}
              disabled={markPending}
            >
              Mark All Present
            </Button>
            <Button
              className="flex-1 border border-[#f97316]/30 bg-[#f97316]/10 text-[#f97316] hover:bg-[#f97316]/20"
              variant="outline"
              onClick={() => markAll("holiday")}
              disabled={markPending}
            >
              Mark All Holiday
            </Button>
          </div>
        </>
      )}

      <div className="mt-6">
        <AbsentLogSection allAttendance={allAttendance} subjects={subjects} />
      </div>
    </div>
  );
}

/** Sample UI only — buttons update locally, nothing is saved to Supabase */
function MarkTodayPreview() {
  const [previewSlots, setPreviewSlots] = useState<TodaySlotAttendance[]>(
    () => [
      {
        slot: {
          id: "preview-1",
          device_id: "preview",
          subject_id: "preview-dsa",
          day_order: 1,
          start_time: "08:00",
          end_time: "08:50",
          room: "AB1-101",
          slot_type: "theory" as const,
          created_at: "",
          subject: {
            id: "preview-dsa",
            device_id: "preview",
            code: "BCSE301L",
            name: "Data Structures (DSA)",
            credits: 3,
            type: "theory",
            faculty: "Dr. Sample",
            color_hex: "#7c6af7",
            created_at: "",
          },
        },
        status: "unmarked",
      },
      {
        slot: {
          id: "preview-2",
          device_id: "preview",
          subject_id: "preview-dbms",
          day_order: 1,
          start_time: "09:00",
          end_time: "09:50",
          room: "AB2-204",
          slot_type: "theory" as const,
          created_at: "",
          subject: {
            id: "preview-dbms",
            device_id: "preview",
            code: "BCSE302L",
            name: "Database Systems",
            credits: 3,
            type: "theory",
            color_hex: "#22d3ee",
            created_at: "",
          },
        },
        status: "present",
      },
    ]
  );

  const markPreview = (
    slotId: string,
    status: MarkAttendanceInput["status"]
  ) => {
    setPreviewSlots((prev) =>
      prev.map((item) =>
        item.slot.id === slotId ? { ...item, status } : item
      )
    );
  };

  return (
    <div className="mt-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <p className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-center text-xs text-amber-200">
        Sample only — tap buttons to see how marking looks. Not saved.
      </p>

      <div className="mb-4 rounded-lg border border-[#7c6af7]/30 bg-[#7c6af7]/10 px-4 py-3">
        <p className="font-syne text-sm font-medium text-[#c4b5fd]">
          Monday, 21 July 2026
        </p>
        <p className="font-mono text-xs text-muted-foreground">
          Day 1 · Mark attendance per class
        </p>
      </div>

      <div className="space-y-3">
        {previewSlots.map((item) => (
          <SlotMarkRow
            key={item.slot.id}
            item={item}
            onMark={(_, status) => markPreview(item.slot.id, status)}
            disabled={false}
          />
        ))}
      </div>

      <div className="mt-6 flex gap-2 opacity-60">
        <Button
          className="flex-1 border border-[#4ade80]/30 bg-[#4ade80]/10 text-[#4ade80]"
          variant="outline"
          disabled
        >
          Mark All Present
        </Button>
        <Button
          className="flex-1 border border-[#f97316]/30 bg-[#f97316]/10 text-[#f97316]"
          variant="outline"
          disabled
        >
          Mark All Holiday
        </Button>
      </div>
    </div>
  );
}

function SlotMarkRow({
  item,
  onMark,
  disabled,
}: {
  item: TodaySlotAttendance;
  onMark: (
    item: TodaySlotAttendance,
    status: MarkAttendanceInput["status"]
  ) => void;
  disabled: boolean;
}) {
  const { slot, status } = item;
  const glow =
    status === "present"
      ? "shadow-[inset_4px_0_0_0_#4ade80]"
      : status === "absent"
        ? "shadow-[inset_4px_0_0_0_#fb7185]"
        : status === "holiday"
          ? "shadow-[inset_4px_0_0_0_#f97316]"
          : "";

  return (
    <div
      className={cn(
        "rounded-lg border border-[#1e1e2e] bg-[#111118] p-4 transition-all",
        glow
      )}
      style={{ borderLeftWidth: 4, borderLeftColor: slot.subject.color_hex }}
    >
      <div className="mb-3">
        <p className="font-mono text-sm text-foreground">
          {formatTime(slot.start_time)} – {formatTime(slot.end_time)}
        </p>
        <p className="font-syne font-semibold text-foreground">
          {slot.subject.name}
        </p>
        {slot.room && (
          <p className="text-xs text-muted-foreground">{slot.room}</p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <MarkButton
          label="Present"
          icon={<Check className="h-4 w-4" />}
          active={status === "present"}
          activeClass="bg-[#4ade80] text-[#0a0a0f] border-[#4ade80]"
          outlineClass="border-[#4ade80]/40 text-[#4ade80]"
          onClick={() => onMark(item, "present")}
          disabled={disabled}
        />
        <MarkButton
          label="Absent"
          icon={<X className="h-4 w-4" />}
          active={status === "absent"}
          activeClass="bg-[#fb7185] text-[#0a0a0f] border-[#fb7185]"
          outlineClass="border-[#fb7185]/40 text-[#fb7185]"
          onClick={() => onMark(item, "absent")}
          disabled={disabled}
        />
        <MarkButton
          label="Holiday"
          icon={<Palmtree className="h-4 w-4" />}
          active={status === "holiday"}
          activeClass="bg-[#f97316] text-[#0a0a0f] border-[#f97316]"
          outlineClass="border-[#f97316]/40 text-[#f97316]"
          onClick={() => onMark(item, "holiday")}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

function MarkButton({
  label,
  icon,
  active,
  activeClass,
  outlineClass,
  onClick,
  disabled,
}: {
  label: string;
  icon: ReactNode;
  active: boolean;
  activeClass: string;
  outlineClass: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex min-h-[44px] flex-col items-center justify-center gap-1 rounded-md border text-xs font-medium transition-colors",
        active ? activeClass : outlineClass,
        !active && "bg-transparent"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function AbsentLogSection({
  allAttendance,
  subjects,
}: {
  allAttendance: Attendance[];
  subjects: Subject[];
}) {
  const MON_SHORT = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

  const absentByDate = useMemo(() => {
    const absents = allAttendance.filter((r) => r.status === "absent");
    const byDate: Record<string, Record<string, number>> = {};
    for (const r of absents) {
      if (!byDate[r.date]) byDate[r.date] = {};
      byDate[r.date][r.subject_id] = (byDate[r.date][r.subject_id] ?? 0) + 1;
    }
    return Object.entries(byDate)
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 30)
      .map(([date, subjectCounts]) => {
        const d = new Date(date + "T00:00:00");
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000);
        const label =
          diff === 0
            ? "TODAY"
            : diff === -1
              ? "YEST"
              : `${String(d.getDate()).padStart(2, "0")} ${MON_SHORT[d.getMonth()]}`;
        const parts = Object.entries(subjectCounts).map(([sid, count]) => {
          const name = subjects.find((s) => s.id === sid)?.code ?? "???";
          return count > 1 ? `${name} (×${count})` : name;
        });
        return { date, label, parts };
      });
  }, [allAttendance, subjects]);

  return (
    <div className="mb-4 rounded-lg border border-[#fb7185]/20 bg-[#111118] p-3">
      <p className="mb-2 text-[10px] font-medium tracking-widest text-[#fb7185]/60">
        ABSENCE LOG
      </p>
      {absentByDate.length === 0 ? (
        <p className="text-xs text-muted-foreground/40 italic">No absences recorded — keep it up!</p>
      ) : (
        <div className="space-y-1.5">
          {absentByDate.map(({ date, label, parts }) => (
            <div key={date} className="flex items-start gap-2 font-mono text-xs">
              <span className="w-10 shrink-0 text-[10px] text-muted-foreground">{label}</span>
              <span className="shrink-0 text-[#fb7185]/40">→</span>
              <span className="min-w-0 flex-1 break-words text-[#fb7185]/80">
                {parts.join(", ")}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
