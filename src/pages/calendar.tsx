import {
  Calendar as CalendarIcon,
  Check,
  ChevronLeft,
  ChevronRight,
  Plus,
} from "lucide-react";
import { useMemo, useRef, useState, useCallback } from "react";
import { useSwipeTabs } from "@/hooks/useSwipeTabs";
import { DeadlineSheet } from "@/components/deadlines/DeadlineSheet";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import {
  useDeadlines,
  useDeleteDeadline,
  useToggleDeadline,
} from "@/hooks/useDeadlines";
import {
  useDeclareDateHoliday,
  useClearDeclaredHoliday,
} from "@/hooks/useSettings";
import {
  ACADEMIC_CALENDAR,
  OFFICIAL_HOLIDAYS,
  SEM_START,
  SEM_END,
} from "@/lib/academicCalendar";
import { getLocalDateString } from "@/lib/attendance";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/useAppStore";
import type { Deadline, Subject } from "@/types/database";

type Tab = "calendar" | "deadlines";
type Filter =
  | "all"
  | "pending"
  | "done"
  | "exam"
  | "assignment"
  | "lab"
  | "other"
  | "high";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "done", label: "Done" },
  { key: "exam", label: "Exam" },
  { key: "assignment", label: "Assignment" },
  { key: "lab", label: "Lab" },
  { key: "other", label: "Other" },
  { key: "high", label: "High Priority" },
];

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthLabel(date: Date) {
  return date.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

function sameDay(left: Date, right: Date) {
  return toDateKey(left) === toDateKey(right);
}

function priorityColor(priority: Deadline["priority"]) {
  if (priority === "high") return "#fb7185";
  if (priority === "medium") return "#facc15";
  return "#4ade80";
}

function deadlineDistance(deadline: Deadline) {
  const today = new Date(getLocalDateString());
  const due = new Date(deadline.due_date.split("T")[0]);
  const diff = Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
  if (diff < 0) return { group: "Overdue", text: `${Math.abs(diff)}d overdue`, tone: "text-[#fb7185]" };
  if (diff === 0) return { group: "Today", text: "Due Today", tone: "text-[#fb7185]" };
  if (diff === 1) return { group: "This Week", text: "Tomorrow", tone: "text-amber-300" };
  if (diff <= 7) return { group: "This Week", text: `${diff} days`, tone: "text-[#facc15]" };
  return {
    group: "Later",
    text: due.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
    tone: "text-muted-foreground",
  };
}

const CAL_TABS = ["calendar", "deadlines"] as const satisfies readonly Tab[];

export default function CalendarPage() {
  const [tab, setTab] = useState<Tab>("calendar");
  const [month, setMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [deadlineSheetOpen, setDeadlineSheetOpen] = useState(false);
  const [deadlineInitialDate, setDeadlineInitialDate] = useState<string | undefined>();
  const [filter, setFilter] = useState<Filter>("all");

  const subjects = useAppStore((state) => state.subjects);
  const settings = useAppStore((state) => state.settings);
  const declaredHolidays = settings?.declared_holidays ?? [];
  const { data: deadlines = [], isLoading, isError } = useDeadlines();

  const selectedDeadlines = deadlines.filter(
    (deadline) => deadline.due_date.split("T")[0] === selectedDate
  );

  const swipe = useSwipeTabs(CAL_TABS, tab, setTab);

  return (
    <main className="min-h-screen bg-background pb-24" onTouchStart={swipe.onTouchStart} onTouchEnd={swipe.onTouchEnd}>
      <header className="sticky top-0 z-40 border-b border-[#1e1e2e] bg-background/95 px-4 pb-3 pt-4 backdrop-blur">
        <h1 className="font-syne text-xl font-bold text-foreground">Calendar</h1>
        <div className="mt-3 flex rounded-lg bg-[#111118] p-1">
          {(["calendar", "deadlines"] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTab(item)}
              className={cn(
                "relative flex-1 rounded-md py-2 text-sm font-medium capitalize transition-all",
                tab === item
                  ? "text-[#7c6af7]"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {item === "calendar" ? "Calendar" : "Deadlines"}
              {tab === item && (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-[#7c6af7]" />
              )}
            </button>
          ))}
        </div>
      </header>

      {isError ? (
        <StateMessage title="Could not load deadlines" />
      ) : tab === "calendar" ? (
        <CalendarTab
          month={month}
          setMonth={setMonth}
          deadlines={deadlines}
          declaredHolidays={declaredHolidays}
          onSelectDate={setSelectedDate}
        />
      ) : (
        <DeadlinesTab
          deadlines={deadlines}
          subjects={subjects}
          filter={filter}
          onFilterChange={setFilter}
          isLoading={isLoading}
          onAdd={() => {
            setDeadlineInitialDate(undefined);
            setDeadlineSheetOpen(true);
          }}
        />
      )}

      <button
        type="button"
        onClick={() => {
          setDeadlineInitialDate(undefined);
          setDeadlineSheetOpen(true);
        }}
        className="fixed bottom-20 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#7c6af7] text-white shadow-lg shadow-[#7c6af7]/25"
        aria-label="Add deadline"
      >
        <Plus className="h-6 w-6" />
      </button>

      <DateSheet
        date={selectedDate}
        deadlines={selectedDeadlines}
        subjects={subjects}
        declaredHolidays={declaredHolidays}
        onClose={() => setSelectedDate(null)}
        onAdd={() => {
          setDeadlineInitialDate(selectedDate ?? undefined);
          setSelectedDate(null);
          setDeadlineSheetOpen(true);
        }}
      />

      <DeadlineSheet
        open={deadlineSheetOpen}
        onClose={() => setDeadlineSheetOpen(false)}
        subjects={subjects}
        initialDate={deadlineInitialDate}
      />
    </main>
  );
}

function CalendarTab({
  month,
  setMonth,
  deadlines,
  declaredHolidays,
  onSelectDate,
}: {
  month: Date;
  setMonth: (date: Date) => void;
  deadlines: Deadline[];
  declaredHolidays: string[];
  onSelectDate: (date: string) => void;
}) {
  const days = useMemo(() => buildCalendarDays(month), [month]);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 px-4 py-4 duration-300">
      <section className="rounded-lg border border-[#1e1e2e] bg-[#111118] p-4">
        <div className="mb-4 flex items-center justify-between">
          <button
            type="button"
            className="rounded-md p-2 text-muted-foreground hover:bg-[#1e1e2e] hover:text-foreground"
            onClick={() =>
              setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
            }
            aria-label="Previous month"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h2 className="font-syne text-lg font-semibold">{monthLabel(month)}</h2>
          <button
            type="button"
            className="rounded-md p-2 text-muted-foreground hover:bg-[#1e1e2e] hover:text-foreground"
            onClick={() =>
              setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
            }
            aria-label="Next month"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center">
          {WEEKDAYS.map((day) => (
            <div key={day} className="pb-2 text-[11px] text-muted-foreground">
              {day}
            </div>
          ))}
          {days.map((day) => (
            <CalendarDayCell
              key={day.key}
              item={day}
              currentMonth={month.getMonth()}
              deadlines={deadlines}
              declaredHolidays={declaredHolidays}
              onSelectDate={onSelectDate}
            />
          ))}
        </div>
      </section>

      <div className="mt-3 flex flex-wrap gap-3 px-1 font-mono text-[10px] text-muted-foreground">
        <Legend color="#7c6af7" label="Today" />
        <Legend color="#fb7185" label="High priority deadline" />
        <Legend color="#facc15" label="Holiday" />
        <Legend color="#4ade80" label="Completed deadline" />
      </div>
    </div>
  );
}

function CalendarDayCell({
  item,
  currentMonth,
  deadlines,
  declaredHolidays,
  onSelectDate,
}: {
  item: { date: Date; key: string };
  currentMonth: number;
  deadlines: Deadline[];
  declaredHolidays: string[];
  onSelectDate: (date: string) => void;
}) {
  const today = new Date();
  const dateKey = item.key;
  const dayDeadlines = deadlines.filter(
    (deadline) => deadline.due_date.split("T")[0] === dateKey
  );
  const highest = [...dayDeadlines].sort((a, b) => {
    const rank = { high: 3, medium: 2, low: 1 };
    return rank[b.priority] - rank[a.priority];
  })[0];
  const hasCompleted = dayDeadlines.some((deadline) => deadline.status === "done");
  const officialHoliday = OFFICIAL_HOLIDAYS[dateKey];
  const declared = declaredHolidays.includes(dateKey);
  const weekend = item.date.getDay() === 0 || item.date.getDay() === 6;
  const inMonth = item.date.getMonth() === currentMonth;
  const isToday = sameDay(item.date, today);

  return (
    <button
      type="button"
      onClick={() => onSelectDate(dateKey)}
      title={officialHoliday}
      className={cn(
        "min-h-[52px] rounded-md border p-1 text-center transition-colors",
        declared ? "border-amber-500/40 bg-amber-500/10" : "border-transparent",
        !inMonth && "opacity-25",
        weekend && "text-muted-foreground",
        "hover:border-[#7c6af7]/40 hover:bg-[#1e1e2e]"
      )}
    >
      <span
        className={cn(
          "mx-auto flex h-7 w-7 items-center justify-center rounded-full font-mono text-xs",
          isToday && "bg-[#7c6af7] text-white"
        )}
      >
        {item.date.getDate()}
      </span>
      <span className="mt-1 flex h-2 items-center justify-center gap-1">
        {highest && (
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: priorityColor(highest.priority) }}
          />
        )}
        {(officialHoliday || declared) && (
          <span className="h-1.5 w-1.5 rounded-full bg-[#facc15]" />
        )}
        {hasCompleted && <span className="h-1.5 w-1.5 rounded-full bg-[#4ade80]" />}
      </span>
    </button>
  );
}

function DeadlinesTab({
  deadlines,
  subjects,
  filter,
  onFilterChange,
  onAdd,
  isLoading,
}: {
  deadlines: Deadline[];
  subjects: Subject[];
  filter: Filter;
  onFilterChange: (filter: Filter) => void;
  onAdd: () => void;
  isLoading: boolean;
}) {
  const filtered = useMemo(
    () => filterDeadlines(deadlines, filter),
    [deadlines, filter]
  );
  const grouped = useMemo(() => groupDeadlines(filtered), [filtered]);

  if (isLoading) {
    return (
      <div className="space-y-3 px-4 py-4">
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-20 rounded-lg" />
      </div>
    );
  }

  if (deadlines.length === 0) {
    return (
      <div className="flex flex-col items-center px-6 py-16 text-center">
        <CalendarIcon className="mb-4 h-12 w-12 text-[#7c6af7]" />
        <p className="font-syne text-lg text-foreground">No deadlines yet</p>
        <p className="mt-2 text-sm text-muted-foreground">Tap + to add your first deadline</p>
        <Button
          className="mt-4 bg-[#7c6af7] text-white hover:bg-[#6b5be0]"
          onClick={onAdd}
        >
          Add your first deadline
        </Button>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 space-y-4 px-4 py-4 duration-300">
      <div className="-mx-4 overflow-x-auto px-4">
        <div className="flex w-max gap-2">
          {FILTERS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => onFilterChange(item.key)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs transition-colors",
                filter === item.key
                  ? "border-[#7c6af7] bg-[#7c6af7]/20 text-[#c4b5fd]"
                  : "border-[#1e1e2e] bg-[#111118] text-muted-foreground"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No {FILTERS.find((item) => item.key === filter)?.label.toLowerCase()} deadlines
        </p>
      ) : (
        <div className="space-y-5">
          {Object.entries(grouped).map(([group, items]) =>
            items.length > 0 ? (
              <section key={group}>
                <h2 className="mb-2 font-syne text-sm font-semibold text-muted-foreground">
                  {group}
                </h2>
                <div className="space-y-2">
                  {items.map((deadline) => (
                    <DeadlineCard
                      key={deadline.id}
                      deadline={deadline}
                      subjects={subjects}
                    />
                  ))}
                </div>
              </section>
            ) : null
          )}
        </div>
      )}
    </div>
  );
}

function DeadlineCard({
  deadline,
  subjects,
}: {
  deadline: Deadline;
  subjects: Subject[];
}) {
  const toggle = useToggleDeadline();
  const deleteDeadline = useDeleteDeadline();
  const { toast } = useToast();
  const timer = useRef<number | null>(null);
  const subject = deadline.subject_id
    ? subjects.find((item) => item.id === deadline.subject_id)
    : null;
  const distance = deadlineDistance(deadline);

  const clearTimer = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const requestDelete = () => {
    if (window.confirm(`Delete "${deadline.title}"?`)) {
      deleteDeadline.mutate(deadline.id, {
        onSuccess: () => toast("Deadline deleted"),
      });
    }
  };

  return (
    <div
      onContextMenu={(event) => {
        event.preventDefault();
        requestDelete();
      }}
      onPointerDown={() => {
        timer.current = window.setTimeout(requestDelete, 650);
      }}
      onPointerUp={clearTimer}
      onPointerLeave={clearTimer}
      className={cn(
        "grid grid-cols-[auto_1fr] gap-3 rounded-lg border border-[#1e1e2e] bg-[#111118] p-3",
        deadline.status === "done" && "opacity-60",
        deadline.priority === "high" && "border-l-4 border-l-[#fb7185]",
        deadline.priority === "medium" && "border-l-4 border-l-[#facc15]",
        deadline.priority === "low" && "border-l-4 border-l-[#4ade80]"
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
        aria-label={`Mark ${deadline.title} ${deadline.status === "done" ? "pending" : "done"}`}
        className={cn(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
          deadline.status === "done"
            ? "border-[#4ade80] bg-[#4ade80] text-black"
            : "border-[#1e1e2e] bg-transparent"
        )}
      >
        {deadline.status === "done" && <Check className="h-3 w-3" strokeWidth={3} />}
      </button>
      <div className="min-w-0">
        <p
          className={cn(
            "truncate font-syne text-sm font-semibold",
            deadline.status === "done" && "line-through"
          )}
        >
          {deadline.title}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <span className="rounded bg-[#1e1e2e] px-1.5 py-0.5 capitalize">
            {deadline.type}
          </span>
          {subject && <span>{subject.name}</span>}
          <span>
            {new Date(deadline.due_date).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
            })}
          </span>
        </div>
        <p className={cn("mt-2 font-mono text-xs", distance.tone)}>
          {distance.text}
        </p>
      </div>
    </div>
  );
}

function DateSheet({
  date,
  deadlines,
  subjects,
  declaredHolidays,
  onClose,
  onAdd,
}: {
  date: string | null;
  deadlines: Deadline[];
  subjects: Subject[];
  declaredHolidays: string[];
  onClose: () => void;
  onAdd: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const { toast } = useToast();
  const declareHoliday = useDeclareDateHoliday();
  const clearHoliday = useClearDeclaredHoliday();

  if (!date) return null;

  const officialHoliday = OFFICIAL_HOLIDAYS[date];
  const isDeclared = declaredHolidays.includes(date);
  const dateObj = new Date(`${date}T00:00:00`);
  const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
  const isOutsideSemester = date < SEM_START || date > SEM_END;
  const isWorkingDay =
    !isWeekend && !isOutsideSemester && !officialHoliday && !isDeclared;
  const dayOrder = ACADEMIC_CALENDAR[date];

  const handleDeclare = () => {
    declareHoliday.mutate(date, {
      onSuccess: () => {
        const label = new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
        });
        toast(`📅 ${label} declared as holiday`);
        setConfirming(false);
        onClose();
      },
    });
  };

  const handleUndo = () => {
    clearHoliday.mutate(date, {
      onSuccess: () => {
        const label = new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
        });
        toast(`Holiday removed for ${label}`);
        onClose();
      },
    });
  };

  return (
    <Sheet open={Boolean(date)} onClose={() => { setConfirming(false); onClose(); }} title={formatDateHeading(date)}>
      <div className="space-y-4">
        <div className="rounded-md bg-[#0a0a0f] p-3">
          <p className="text-xs text-muted-foreground">Day Order</p>
          <p className="mt-1 font-mono text-lg text-[#c4b5fd]">
            {dayOrder ? `Day ${dayOrder}` : "-"}
          </p>
        </div>

        {officialHoliday ? (
          <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2">
            <span className="text-sm text-amber-300">
              {officialHoliday} — Official Holiday
            </span>
          </div>
        ) : isDeclared ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2">
              <span className="text-sm text-amber-300">Declared Holiday</span>
            </div>
            <Button
              variant="outline"
              className="w-full border-amber-500/50 text-amber-300 hover:bg-amber-500/10 hover:text-amber-200"
              onClick={handleUndo}
              disabled={clearHoliday.isPending}
            >
              ↩ Undo Holiday
            </Button>
          </div>
        ) : isWeekend ? (
          <div className="flex items-center gap-2 rounded-md border border-[#1e1e2e] px-3 py-2">
            <span className="text-sm text-muted-foreground">Weekend</span>
          </div>
        ) : isOutsideSemester ? (
          <div className="flex items-center gap-2 rounded-md border border-[#1e1e2e] px-3 py-2">
            <span className="text-sm text-muted-foreground">Outside Semester</span>
          </div>
        ) : isWorkingDay ? (
          confirming ? (
            <div className="space-y-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
              <p className="text-sm font-medium text-amber-200">
                Declare{" "}
                {dateObj.toLocaleDateString("en-IN", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}{" "}
                as a holiday?
              </p>
              {dayOrder && (
                <p className="text-xs text-amber-300/80">
                  Day Order {dayOrder} will carry forward to the next working day.
                </p>
              )}
              <div className="flex gap-2">
                <Button
                  className="flex-1 bg-amber-500 text-black hover:bg-amber-400"
                  onClick={handleDeclare}
                  disabled={declareHoliday.isPending}
                >
                  Confirm
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 border-[#1e1e2e]"
                  onClick={() => setConfirming(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              className="w-full bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/40"
              variant="outline"
              onClick={() => setConfirming(true)}
            >
              🏖️ Declare as Holiday
            </Button>
          )
        ) : null}

        {deadlines.length === 0 ? (
          <p className="py-2 text-center text-sm text-muted-foreground">
            No deadlines on this date
          </p>
        ) : (
          <div className="space-y-2">
            {deadlines.map((deadline) => {
              const subject = deadline.subject_id
                ? subjects.find((item) => item.id === deadline.subject_id)
                : null;
              return (
                <div
                  key={deadline.id}
                  className="rounded-md border border-[#1e1e2e] bg-[#0a0a0f] p-3"
                >
                  <p className="font-syne text-sm font-semibold">
                    {deadline.title}
                  </p>
                  <p className="mt-1 text-xs capitalize text-muted-foreground">
                    {deadline.type}
                    {subject ? ` · ${subject.name}` : ""}
                  </p>
                </div>
              );
            })}
          </div>
        )}
        <Button
          className="w-full bg-[#7c6af7] text-white hover:bg-[#6b5be0]"
          onClick={onAdd}
        >
          Add deadline for this date
        </Button>
      </div>
    </Sheet>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function StateMessage({ title }: { title: string }) {
  return (
    <div className="px-6 py-16 text-center">
      <p className="font-syne text-foreground">{title}</p>
    </div>
  );
}

function buildCalendarDays(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const startOffset = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - startOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return { date, key: toDateKey(date) };
  });
}

function filterDeadlines(deadlines: Deadline[], filter: Filter) {
  return deadlines.filter((deadline) => {
    if (filter === "all") return true;
    if (filter === "pending" || filter === "done") {
      return deadline.status === filter;
    }
    if (filter === "high") return deadline.priority === "high";
    return deadline.type === filter;
  });
}

function groupDeadlines(deadlines: Deadline[]) {
  const groups: Record<string, Deadline[]> = {
    Overdue: [],
    Today: [],
    "This Week": [],
    Later: [],
  };

  deadlines
    .slice()
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
    .forEach((deadline) => {
      groups[deadlineDistance(deadline).group]?.push(deadline);
    });

  return groups;
}

function formatDateHeading(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
