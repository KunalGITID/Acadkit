import { CalendarDays, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSwipeTabs } from "@/hooks/useSwipeTabs";
import { SubjectList } from "@/components/subjects/SubjectList";
import { SubjectSheet } from "@/components/subjects/SubjectSheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import {
  daysUntilSemesterStart,
  getNextCalendarDate,
  getTodayStatus,
} from "@/lib/academicCalendar";
import {
  addMinutesToTime,
  DAY_ORDER_LABELS,
  DAY_ORDERS,
  formatDuration,
  formatTime,
  generateTimeOptions,
  isSlotActive,
  isSlotPast,
  normalizeTime,
  slotsOverlap,
  timeToMinutes,
} from "@/lib/constants";
import {
  useAddSlot,
  useDeleteSlot,
  useTimetable,
  useTimetableByDay,
} from "@/hooks/useTimetable";
import {
  useDeclareTodayHoliday,
  useUndoTodayHoliday,
} from "@/hooks/useSettings";
import { useSubjects } from "@/hooks/useSubjects";
import { useAppStore } from "@/store/useAppStore";
import type { Subject, TimetableSlot } from "@/types/database";
import { cn } from "@/lib/utils";

type Tab = "schedule" | "manage";
const TABS = ["schedule", "manage"] as const satisfies readonly Tab[];

function getSubjectName(
  subjectId: string,
  subjects: Subject[]
): string {
  return subjects.find((s) => s.id === subjectId)?.name ?? "Unknown";
}

export default function TimetablePage() {
  const [tab, setTab] = useState<Tab>("schedule");
  const [selectedDay, setSelectedDay] = useState(1);
  const swipe = useSwipeTabs(TABS, tab, setTab);
  const [subjectSheetOpen, setSubjectSheetOpen] = useState(false);
  const [addSlotOpen, setAddSlotOpen] = useState(false);
  const [holidaySheetOpen, setHolidaySheetOpen] = useState(false);
  const [deleteSlotId, setDeleteSlotId] = useState<string | null>(null);

  useSubjects();
  const subjects = useAppStore((s) => s.subjects);
  const settings = useAppStore((s) => s.settings);
  const todayDayOrder = useAppStore((s) => s.todayDayOrder);
  const { toast } = useToast();

  const declared = settings?.declared_holidays ?? [];
  const todayStatus = getTodayStatus(declared);

  const { data: daySlots = [] } = useTimetableByDay(selectedDay);
  const { data: allSlots = [] } = useTimetable();
  const addSlot = useAddSlot();
  const deleteSlot = useDeleteSlot();
  const declareHoliday = useDeclareTodayHoliday();
  const undoHoliday = useUndoTodayHoliday();

  const isViewingToday =
    todayDayOrder !== null && selectedDay === todayDayOrder;

  const classCountToday = useMemo(() => {
    if (todayDayOrder === null) return 0;
    return allSlots.filter((s) => s.day_order === todayDayOrder).length;
  }, [allSlots, todayDayOrder]);

  useEffect(() => {
    if (todayDayOrder !== null) {
      setSelectedDay(todayDayOrder);
    }
  }, [todayDayOrder]);

  const showHolidayButton =
    !todayStatus.isWeekend &&
    !todayStatus.isPreSemester &&
    !todayStatus.isPostSemester;

  const formattedDate = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const carryDay = todayStatus.dayOrder ?? settings?.current_day_order ?? 1;
  const nextDate = getNextCalendarDate(todayStatus.todayStr);

  return (
    <main
      className="min-h-screen bg-background pb-24"
      onTouchStart={swipe.onTouchStart}
      onTouchEnd={swipe.onTouchEnd}
    >
      <header className="sticky top-0 z-40 border-b border-[#1e1e2e] bg-background/95 px-4 pb-3 pt-4 backdrop-blur">
        <div className="flex items-center justify-between">
          <h1 className="font-syne text-xl font-bold text-foreground">
            Timetable
          </h1>
          {tab === "schedule" && showHolidayButton && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1 border-[#1e1e2e]"
              onClick={() => setHolidaySheetOpen(true)}
            >
              <span>🏖️</span> Holiday
            </Button>
          )}
        </div>

        <div className="mt-3 flex rounded-lg bg-[#111118] p-1">
          {(["schedule", "manage"] as const).map((t) => (
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
              {t === "schedule" ? "Schedule" : "Manage"}
              {tab === t && (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-[#7c6af7]" />
              )}
            </button>
          ))}
        </div>
      </header>

      {tab === "schedule" ? (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
          <TodayStatusBanner
            status={todayStatus}
            classCount={classCountToday}
            formattedDate={formattedDate}
            carryDay={carryDay}
            nextDate={nextDate}
            onUndoHoliday={() => undoHoliday.mutate()}
            undoPending={undoHoliday.isPending}
          />

          <DayOrderTabs
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
            todayDayOrder={todayDayOrder}
          />

          <TimelineView
            slots={daySlots}
            subjects={subjects}
            isViewingToday={isViewingToday}
            dayOrder={selectedDay}
            onAddSlot={() => setAddSlotOpen(true)}
            onLongPressDelete={(id) => setDeleteSlotId(id)}
          />
        </div>
      ) : (
        <ManageTab
          subjects={subjects}
          onAddSubject={() => setSubjectSheetOpen(true)}
        />
      )}

      {tab === "schedule" && (
        <button
          type="button"
          onClick={() => setAddSlotOpen(true)}
          className="fixed bottom-20 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#7c6af7] text-white shadow-lg shadow-[#7c6af7]/30 transition-transform active:scale-95"
          aria-label="Add class slot"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}

      <SubjectSheet
        open={subjectSheetOpen}
        onClose={() => setSubjectSheetOpen(false)}
      />

      <AddSlotSheet
        open={addSlotOpen}
        onClose={() => setAddSlotOpen(false)}
        subjects={subjects}
        allSlots={allSlots}
        defaultDayOrder={todayDayOrder ?? selectedDay}
        onSuccess={(msg) => toast(msg)}
        addSlot={addSlot}
      />

      <DeclareHolidaySheet
        open={holidaySheetOpen}
        onClose={() => setHolidaySheetOpen(false)}
        carryDay={carryDay}
        nextDate={nextDate}
        onConfirm={async () => {
          await declareHoliday.mutateAsync();
          toast("Today declared as holiday");
          setHolidaySheetOpen(false);
        }}
        pending={declareHoliday.isPending}
      />

      <DeleteSlotDialog
        slotId={deleteSlotId}
        subjects={subjects}
        slots={allSlots}
        onClose={() => setDeleteSlotId(null)}
        onConfirm={async (id) => {
          await deleteSlot.mutateAsync(id);
          toast("Slot removed");
          setDeleteSlotId(null);
        }}
        pending={deleteSlot.isPending}
      />
    </main>
  );
}

function TodayStatusBanner({
  status,
  classCount,
  formattedDate,
  carryDay,
  nextDate,
  onUndoHoliday,
  undoPending,
}: {
  status: ReturnType<typeof getTodayStatus>;
  classCount: number;
  formattedDate: string;
  carryDay: number;
  nextDate: string | null;
  onUndoHoliday: () => void;
  undoPending: boolean;
}) {
  const daysToGo = daysUntilSemesterStart(status.todayStr);

  if (status.isPreSemester) {
    return (
      <Banner
        className="border-cyan-500/30 bg-cyan-500/10 text-cyan-200"
        text={`Semester begins July 21, 2026 · ${daysToGo} days to go`}
      />
    );
  }

  if (status.isPostSemester) {
    return (
      <Banner
        className="border-[#1e1e2e] bg-white/5 text-muted-foreground"
        text="Semester ended · See you next term"
      />
    );
  }

  if (status.isWeekend) {
    return (
      <Banner
        className="border-[#1e1e2e] bg-white/5 text-muted-foreground"
        text="Weekend · Enjoy the break"
      />
    );
  }

  if (status.isHoliday && status.holidayName && !status.isDeclaredHoliday) {
    return (
      <Banner
        className="border-amber-500/30 bg-amber-500/10 text-amber-200"
        text={`🎉 ${status.holidayName} · Holiday · Day ${carryDay} carries forward`}
      />
    );
  }

  if (status.isDeclaredHoliday) {
    return (
      <div className="mx-4 mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-amber-200">
            🏖️ Declared Holiday · Day {carryDay} carries forward
            {nextDate ? ` to ${nextDate}` : ""}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 text-amber-300"
            onClick={onUndoHoliday}
            disabled={undoPending}
          >
            Undo
          </Button>
        </div>
      </div>
    );
  }

  if (status.dayOrder !== null) {
    return (
      <Banner
        className="border-[#7c6af7]/30 bg-[#7c6af7]/10 text-[#c4b5fd]"
        text={`Today · Day ${status.dayOrder} · ${formattedDate} · ${classCount} class${classCount === 1 ? "" : "es"} today`}
      />
    );
  }

  return (
    <Banner
      className="border-[#1e1e2e] bg-white/5 text-muted-foreground"
      text="No class day scheduled today"
    />
  );
}

function Banner({ className, text }: { className: string; text: string }) {
  return (
    <div
      className={cn(
        "mx-4 mt-4 rounded-lg border px-4 py-3 text-sm",
        className
      )}
    >
      {text}
    </div>
  );
}

function DayOrderTabs({
  selectedDay,
  onSelectDay,
  todayDayOrder,
}: {
  selectedDay: number;
  onSelectDay: (d: number) => void;
  todayDayOrder: number | null;
}) {
  return (
    <div className="mt-4 flex gap-1 overflow-x-auto px-4 pb-1 scrollbar-none">
      {DAY_ORDERS.map((day) => (
        <button
          key={day}
          type="button"
          onClick={() => onSelectDay(day)}
          className={cn(
            "relative shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
            selectedDay === day
              ? "bg-[#7c6af7]/20 text-[#7c6af7]"
              : "text-muted-foreground hover:bg-[#111118]"
          )}
        >
          {DAY_ORDER_LABELS[day - 1]}
          {todayDayOrder === day && (
            <span className="absolute -bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-[#7c6af7]" />
          )}
        </button>
      ))}
    </div>
  );
}

function TimelineView({
  slots,
  subjects,
  isViewingToday,
  dayOrder,
  onAddSlot,
  onLongPressDelete,
}: {
  slots: TimetableSlot[];
  subjects: Subject[];
  isViewingToday: boolean;
  dayOrder: number;
  onAddSlot: () => void;
  onLongPressDelete: (id: string) => void;
}) {
  const slotsWithSubject = useMemo(
    () =>
      slots.map((slot) => ({
        slot,
        subject: subjects.find((s) => s.id === slot.subject_id),
      })),
    [slots, subjects]
  );

  if (slotsWithSubject.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
        <CalendarDays className="mb-4 h-12 w-12 text-muted-foreground/50" />
        <p className="font-syne text-lg text-foreground">
          No classes on Day {dayOrder}
        </p>
        <button
          type="button"
          onClick={onAddSlot}
          className="mt-3 text-sm text-[#7c6af7]"
        >
          Add a class +
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-0 px-4 py-4">
      {slotsWithSubject.map(({ slot, subject }, index) => {
        const prev = slotsWithSubject[index - 1];
        let gapMins = 0;
        if (prev) {
          gapMins =
            timeToMinutes(slot.start_time) -
            timeToMinutes(prev.slot.end_time);
        }

        const active =
          isViewingToday && isSlotActive(slot.start_time, slot.end_time);
        const past = isViewingToday && isSlotPast(slot.end_time);

        return (
          <div key={slot.id}>
            {gapMins >= 5 && (
              <p className="py-2 text-center font-mono text-xs text-muted-foreground/60">
                ── {gapMins} min gap ──
              </p>
            )}
            <SlotCard
              slot={slot}
              subject={subject}
              active={active}
              past={past}
              onLongPressDelete={onLongPressDelete}
            />
          </div>
        );
      })}
    </div>
  );
}

function SlotCard({
  slot,
  subject,
  active,
  past,
  onLongPressDelete,
}: {
  slot: TimetableSlot;
  subject?: Subject;
  active: boolean;
  past: boolean;
  onLongPressDelete: (id: string) => void;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startLongPress = useCallback(() => {
    timerRef.current = setTimeout(() => onLongPressDelete(slot.id), 500);
  }, [onLongPressDelete, slot.id]);

  const endLongPress = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return (
    <div
      className={cn(
        "relative mb-3 flex overflow-hidden rounded-lg border border-[#1e1e2e] bg-[#111118] transition-all hover:bg-[#1a1a2e]",
        active && "animate-pulse border-[#7c6af7] shadow-[0_0_12px_rgba(124,106,247,0.4)]",
        past && "opacity-40"
      )}
      style={{ borderLeftWidth: 4, borderLeftColor: subject?.color_hex ?? "#7c6af7" }}
      onTouchStart={startLongPress}
      onTouchEnd={endLongPress}
      onTouchCancel={endLongPress}
      onMouseDown={startLongPress}
      onMouseUp={endLongPress}
      onMouseLeave={endLongPress}
    >
      <div className="flex-1 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm text-foreground">
            {formatTime(slot.start_time)} – {formatTime(slot.end_time)}
          </span>
          <span className="rounded bg-[#1e1e2e] px-2 py-0.5 font-mono text-xs text-muted-foreground">
            {formatDuration(slot.start_time, slot.end_time)}
          </span>
        </div>
        <p className="mt-1 font-syne text-base font-semibold text-foreground">
          {subject?.name ?? "Unknown subject"}
        </p>
        {slot.room && (
          <p className="mt-0.5 text-xs text-muted-foreground">{slot.room}</p>
        )}
        {subject?.faculty && (
          <p className="text-xs text-muted-foreground">{subject.faculty}</p>
        )}
      </div>
      {active && (
        <span className="absolute right-2 top-2 rounded bg-[#7c6af7] px-2 py-0.5 text-[10px] font-bold text-white">
          NOW
        </span>
      )}
      {past && !active && (
        <span className="absolute right-2 top-2 rounded bg-[#1e1e2e] px-2 py-0.5 text-[10px] text-muted-foreground">
          Done
        </span>
      )}
    </div>
  );
}

function ManageTab({
  subjects,
  onAddSubject,
}: {
  subjects: Subject[];
  onAddSubject: () => void;
}) {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 px-4 py-4 duration-300">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="font-syne text-lg font-semibold">My Subjects</h2>
          <span className="rounded-full bg-[#1e1e2e] px-2 py-0.5 text-xs text-muted-foreground">
            {subjects.length}
          </span>
        </div>
        <Button
          size="sm"
          className="bg-[#7c6af7] hover:bg-[#7c6af7]/90"
          onClick={onAddSubject}
        >
          + Add Subject
        </Button>
      </div>

      {subjects.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <span className="mb-4 text-5xl">📚</span>
          <p className="font-syne text-lg text-foreground">
            No subjects added yet
          </p>
          <Button
            className="mt-4 bg-[#7c6af7] hover:bg-[#7c6af7]/90"
            onClick={onAddSubject}
          >
            Add your first subject
          </Button>
        </div>
      ) : (
        <SubjectList />
      )}
    </div>
  );
}

function AddSlotSheet({
  open,
  onClose,
  subjects,
  allSlots,
  defaultDayOrder,
  onSuccess,
  addSlot,
}: {
  open: boolean;
  onClose: () => void;
  subjects: Subject[];
  allSlots: TimetableSlot[];
  defaultDayOrder: number;
  onSuccess: (msg: string) => void;
  addSlot: ReturnType<typeof useAddSlot>;
}) {
  const deviceId = useAppStore((s) => s.deviceId);
  const timeOptions = useMemo(() => generateTimeOptions(), []);

  const [dayOrder, setDayOrder] = useState(defaultDayOrder);
  const [subjectId, setSubjectId] = useState("");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("08:50");
  const [room, setRoom] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleStartChange = (t: string) => {
    setStartTime(t);
    setEndTime(addMinutesToTime(t, 50));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!subjectId) {
      setError("Select a subject.");
      return;
    }

    const start = normalizeTime(startTime);
    const end = normalizeTime(endTime);

    if (timeToMinutes(end) <= timeToMinutes(start)) {
      setError("End time must be after start time.");
      return;
    }

    const duration = timeToMinutes(end) - timeToMinutes(start);
    if (duration < 30) {
      setError("Duration must be at least 30 minutes.");
      return;
    }

    const daySlots = allSlots.filter((s) => s.day_order === dayOrder);
    for (const existing of daySlots) {
      if (
        slotsOverlap(start, end, existing.start_time, existing.end_time)
      ) {
        setError(
          `Conflicts with ${getSubjectName(existing.subject_id, subjects)} at ${formatTime(existing.start_time)}–${formatTime(existing.end_time)}`
        );
        return;
      }
    }

    try {
      await addSlot.mutateAsync({
        device_id: deviceId,
        subject_id: subjectId,
        day_order: dayOrder,
        start_time: start,
        end_time: end,
        room: room.trim() || undefined,
      });
      onSuccess(`Class added to Day ${dayOrder}`);
      onClose();
    } catch {
      setError("Failed to add slot.");
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Add Class">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label>Day Order</Label>
          <div className="flex gap-1 overflow-x-auto">
            {DAY_ORDERS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDayOrder(d)}
                className={cn(
                  "shrink-0 rounded-md px-3 py-2 text-xs",
                  dayOrder === d
                    ? "bg-[#7c6af7]/20 text-[#7c6af7]"
                    : "bg-[#0a0a0f] text-muted-foreground"
                )}
              >
                Day {d}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Subject</Label>
          {subjects.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No subjects added. Go to Manage tab first.
            </p>
          ) : (
            <select
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-[#111118] px-3 text-sm"
              required
            >
              <option value="">Select subject</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Start Time</Label>
            <select
              value={startTime}
              onChange={(e) => handleStartChange(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-[#111118] px-2 font-mono text-sm"
            >
              {timeOptions.map((t) => (
                <option key={t} value={t}>
                  {formatTime(t)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>End Time</Label>
            <select
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-[#111118] px-2 font-mono text-sm"
            >
              {timeOptions.map((t) => (
                <option key={`end-${t}`} value={t}>
                  {formatTime(t)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="room">Room (optional)</Label>
          <Input
            id="room"
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            placeholder="AB1-101"
          />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <Button
          type="submit"
          className="w-full bg-[#7c6af7]"
          disabled={addSlot.isPending || subjects.length === 0}
        >
          {addSlot.isPending ? "Saving…" : "Add Class"}
        </Button>
      </form>
    </Sheet>
  );
}

function DeclareHolidaySheet({
  open,
  onClose,
  carryDay,
  nextDate,
  onConfirm,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  carryDay: number;
  nextDate: string | null;
  onConfirm: () => void;
  pending: boolean;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Declare Today as Holiday?">
      <p className="mb-4 text-sm text-muted-foreground">
        Today (Day {carryDay}) will be marked as a holiday. Day {carryDay} will
        carry forward{nextDate ? ` to ${nextDate}` : ""}.
      </p>
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="amber"
          className="flex-1"
          onClick={onConfirm}
          disabled={pending}
        >
          Confirm Holiday
        </Button>
      </div>
    </Sheet>
  );
}

function DeleteSlotDialog({
  slotId,
  subjects,
  slots,
  onClose,
  onConfirm,
  pending,
}: {
  slotId: string | null;
  subjects: Subject[];
  slots: TimetableSlot[];
  onClose: () => void;
  onConfirm: (id: string) => void;
  pending: boolean;
}) {
  const slot = slots.find((s) => s.id === slotId);
  const name = slot ? getSubjectName(slot.subject_id, subjects) : "this class";

  useEffect(() => {
    if (!slotId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [slotId, onClose]);

  if (!slotId) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Delete slot"
    >
      <div
        className="absolute inset-0 bg-black/60 animate-in fade-in duration-200"
        aria-hidden="true"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-sm animate-in zoom-in-95 fade-in duration-200 rounded-xl border border-[#1e1e2e] bg-[#111118] p-6 text-foreground shadow-2xl">
        <h3 className="font-syne font-semibold">Delete slot?</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Remove {name} from the timetable?
        </p>
        <div className="mt-4 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            className="flex-1"
            disabled={pending}
            onClick={() => slotId && onConfirm(slotId)}
          >
            {pending ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </div>
    </div>
  );
}
