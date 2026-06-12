import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarCheck2,
  ChevronLeft,
  ChevronRight,
  PartyPopper,
  Plus,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Badge, Dot } from "@/components/ui/misc";
import { MarkDaySheet } from "@/components/sheets/mark-day-sheet";
import { DeadlineSheet } from "@/components/sheets/deadline-sheet";
import { useDeadlines, useSettings, useSubjects, useUpdateSettings } from "@/hooks/useData";
import { getDayInfo, SEMESTER_END, SEMESTER_START } from "@/lib/calendar";
import { formatDateLong, parseISODate, toISODate, todayISO } from "@/lib/dates";
import { cn, haptic } from "@/lib/utils";
import type { Deadline } from "@/types";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function monthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
}

export default function Calendar() {
  const today = todayISO();
  const startOfSem = parseISODate(SEMESTER_START);
  const initial = parseISODate(today) < startOfSem ? startOfSem : parseISODate(today);

  const [year, setYear] = useState(initial.getFullYear());
  const [month, setMonth] = useState(initial.getMonth());
  const [selected, setSelected] = useState<string | null>(null);
  const [markDate, setMarkDate] = useState<string | null>(null);
  const [deadlineOpen, setDeadlineOpen] = useState(false);

  const { data: settings } = useSettings();
  const { data: deadlines } = useDeadlines();
  const { data: subjects } = useSubjects();
  const updateSettings = useUpdateSettings();

  const declared = useMemo(() => settings?.declared_holidays ?? [], [settings]);

  const cells = useMemo(() => {
    const first = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const lead = (first.getDay() + 6) % 7; // Monday-first offset
    const result: Array<string | null> = Array(lead).fill(null);
    for (let d = 1; d <= daysInMonth; d++) {
      result.push(toISODate(new Date(year, month, d)));
    }
    while (result.length % 7 !== 0) result.push(null);
    return result;
  }, [year, month]);

  const deadlinesByDate = useMemo(() => {
    const map = new Map<string, Deadline[]>();
    for (const d of deadlines ?? []) {
      const key = toISODate(new Date(d.due_date));
      const list = map.get(key) ?? [];
      list.push(d);
      map.set(key, list);
    }
    return map;
  }, [deadlines]);

  function shiftMonth(delta: number) {
    haptic();
    const next = new Date(year, month + delta, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
  }

  const selectedInfo = selected ? getDayInfo(selected, declared) : null;
  const selectedDeadlines = selected ? deadlinesByDate.get(selected) ?? [] : [];
  const isDeclared = selected ? declared.some((h) => h.date === selected) : false;
  const canDeclare =
    selectedInfo?.kind === "working" &&
    selected !== null &&
    selected >= SEMESTER_START &&
    selected <= SEMESTER_END;

  function declareHoliday() {
    if (!selected) return;
    const name = window.prompt("Name this holiday (optional):", "Declared holiday");
    if (name === null) return;
    updateSettings.mutate({
      declared_holidays: [...declared, { date: selected, name: name || "Declared holiday" }],
    });
    toast.success("Holiday declared — remaining day orders shift forward");
    setSelected(null);
  }

  function undeclareHoliday() {
    if (!selected) return;
    updateSettings.mutate({
      declared_holidays: declared.filter((h) => h.date !== selected),
    });
    toast.success("Holiday removed — day orders restored");
    setSelected(null);
  }

  return (
    <div className="space-y-4">
      <h1 className="px-1 text-2xl font-extrabold tracking-tight lg:text-3xl">Calendar</h1>

      <section className="card p-4 lg:p-6">
        <div className="mb-4 flex items-center justify-between">
          <Button variant="ghost" size="icon" aria-label="Previous month" onClick={() => shiftMonth(-1)}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <AnimatePresence mode="wait">
            <motion.p
              key={`${year}-${month}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="text-lg font-extrabold"
            >
              {monthLabel(year, month)}
            </motion.p>
          </AnimatePresence>
          <Button variant="ghost" size="icon" aria-label="Next month" onClick={() => shiftMonth(1)}>
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center">
          {WEEKDAYS.map((d) => (
            <span key={d} className="pb-2 text-[11px] font-bold uppercase tracking-wide text-muted">
              {d}
            </span>
          ))}
          {cells.map((date, i) => {
            if (!date) return <span key={`pad-${i}`} />;
            const info = getDayInfo(date, declared);
            const isToday = date === today;
            const dayDeadlines = deadlinesByDate.get(date) ?? [];
            const isHoliday =
              info.kind === "official-holiday" || info.kind === "declared-holiday";
            return (
              <button
                key={date}
                onClick={() => setSelected(date)}
                className={cn(
                  "relative flex aspect-square flex-col items-center justify-center rounded-2xl text-sm font-semibold transition-colors",
                  isToday
                    ? "bg-accent text-white shadow-pop"
                    : isHoliday
                      ? "bg-warn/15 text-warn-deep hover:bg-warn/25"
                      : info.kind === "weekend"
                        ? "text-muted/50 hover:bg-surface-2"
                        : "hover:bg-surface-2"
                )}
              >
                <span className="tabular">{parseISODate(date).getDate()}</span>
                {info.dayOrder !== null && (
                  <span
                    className={cn(
                      "text-[9px] font-extrabold leading-tight",
                      isToday ? "text-white/80" : "text-accent"
                    )}
                  >
                    D{info.dayOrder}
                  </span>
                )}
                {isHoliday && <PartyPopper className="h-3 w-3" aria-label="Holiday" />}
                {dayDeadlines.length > 0 && (
                  <span className="absolute right-1.5 top-1.5 flex gap-0.5">
                    {dayDeadlines.slice(0, 3).map((d) => (
                      <span
                        key={d.id}
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          d.status === "done" ? "bg-muted/40" : "bg-bad"
                        )}
                      />
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 border-t pt-3 text-[11px] font-medium text-muted">
          <span className="flex items-center gap-1.5">
            <span className="flex h-4 w-4 items-center justify-center rounded-md bg-accent text-[8px] font-bold text-white">
              D
            </span>
            day order
          </span>
          <span className="flex items-center gap-1.5">
            <PartyPopper className="h-3.5 w-3.5 text-warn-deep" /> holiday
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-bad" /> deadline
          </span>
        </div>
      </section>

      {/* Day detail sheet */}
      <Sheet
        open={selected !== null && markDate === null && !deadlineOpen}
        onOpenChange={(o) => !o && setSelected(null)}
        title={selected ? formatDateLong(selected) : ""}
        description={
          selectedInfo?.kind === "working"
            ? `Day Order ${selectedInfo.dayOrder}`
            : selectedInfo?.holidayName ??
              (selectedInfo?.kind === "weekend"
                ? "Weekend"
                : selectedInfo?.kind === "pre-semester"
                  ? "Before semester start"
                  : selectedInfo?.kind === "post-semester"
                    ? "After semester end"
                    : "No day order")
        }
      >
        <div className="space-y-4">
          {selectedDeadlines.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-widest text-muted">Due this day</p>
              {selectedDeadlines.map((d) => {
                const subject = subjects?.find((s) => s.id === d.subject_id);
                return (
                  <div key={d.id} className="flex items-center gap-3 rounded-2xl border bg-surface-2/40 p-3">
                    <Dot color={subject?.color_hex ?? "hsl(var(--accent))"} />
                    <div className="min-w-0 flex-1">
                      <p className={cn("truncate text-sm font-bold", d.status === "done" && "text-muted line-through")}>
                        {d.title}
                      </p>
                      {subject && <p className="text-xs text-muted">{subject.code}</p>}
                    </div>
                    <Badge className={cn(d.type === "exam" ? "bg-bad/10 text-bad-deep" : "bg-accent/10 text-accent")}>
                      {d.type}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}

          <div className="grid gap-2.5">
            {selectedInfo?.dayOrder != null && (
              <Button variant="secondary" className="w-full" onClick={() => setMarkDate(selected)}>
                <CalendarCheck2 className="h-4 w-4" /> Mark attendance for this day
              </Button>
            )}
            <Button variant="outline" className="w-full" onClick={() => setDeadlineOpen(true)}>
              <Plus className="h-4 w-4" /> Add deadline on this date
            </Button>
            {canDeclare && (
              <Button variant="danger" className="w-full" onClick={declareHoliday}>
                <PartyPopper className="h-4 w-4" /> Declare holiday (shifts day orders)
              </Button>
            )}
            {isDeclared && (
              <Button variant="danger" className="w-full" onClick={undeclareHoliday}>
                <Undo2 className="h-4 w-4" /> Remove declared holiday
              </Button>
            )}
          </div>
        </div>
      </Sheet>

      <MarkDaySheet
        date={markDate}
        onClose={() => {
          setMarkDate(null);
          setSelected(null);
        }}
      />
      <DeadlineSheet
        open={deadlineOpen}
        onClose={() => {
          setDeadlineOpen(false);
          setSelected(null);
        }}
        deadline={null}
        defaultDate={selected ?? undefined}
      />
    </div>
  );
}
