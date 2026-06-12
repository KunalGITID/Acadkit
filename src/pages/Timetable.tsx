import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarPlus, Clock3, FlaskConical, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Badge, Dot, EmptyState, Skeleton } from "@/components/ui/misc";
import { SlotSheet } from "@/components/sheets/slot-sheet";
import { useSubjects, useTimetable } from "@/hooks/useData";
import { useToday } from "@/hooks/useToday";
import { formatTime } from "@/lib/dates";
import type { TimetableSlot } from "@/types";

export default function Timetable() {
  const { data: timetable, isLoading: tLoading } = useTimetable();
  const { data: subjects, isLoading: sLoading } = useSubjects();
  const { info } = useToday();

  const [dayOrder, setDayOrder] = useState(info.dayOrder ?? 1);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<TimetableSlot | null>(null);

  const slots = useMemo(
    () =>
      (timetable ?? [])
        .filter((s) => s.day_order === dayOrder)
        .sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [timetable, dayOrder]
  );

  if (tLoading || sLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <h1 className="text-2xl font-extrabold tracking-tight lg:text-3xl">Timetable</h1>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setSheetOpen(true);
          }}
        >
          <Plus className="h-4 w-4" /> Add class
        </Button>
      </div>

      <Segmented
        layoutId="timetable-day"
        options={[1, 2, 3, 4, 5].map((d) => ({
          value: d,
          label: info.dayOrder === d ? `Day ${d} •` : `Day ${d}`,
        }))}
        value={dayOrder}
        onChange={setDayOrder}
      />

      <AnimatePresence mode="popLayout">
        {slots.length === 0 ? (
          <motion.div
            key={`empty-${dayOrder}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="card"
          >
            <EmptyState
              icon={CalendarPlus}
              title={`Day Order ${dayOrder} is empty`}
              description="Add the classes that run on this day order — attendance marking needs them."
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setEditing(null);
                    setSheetOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4" /> Add first class
                </Button>
              }
            />
          </motion.div>
        ) : (
          <motion.div key={`list-${dayOrder}`} className="relative space-y-3">
            {/* timeline rail */}
            <div aria-hidden className="absolute bottom-6 left-[21px] top-6 w-px bg-line/10" />
            {slots.map((slot, i) => {
              const subject = subjects?.find((s) => s.id === slot.subject_id);
              const isLab = slot.slot_type === "lab";
              return (
                <motion.button
                  key={slot.id}
                  layout
                  initial={{ opacity: 0, x: -14 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 14 }}
                  transition={{ type: "spring", stiffness: 300, damping: 28, delay: i * 0.04 }}
                  onClick={() => {
                    setEditing(slot);
                    setSheetOpen(true);
                  }}
                  className="card relative flex w-full items-center gap-4 p-4 text-left transition-transform active:scale-[0.99]"
                >
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
                    style={{ backgroundColor: `${subject?.color_hex ?? "#888"}22` }}
                  >
                    {isLab ? (
                      <FlaskConical
                        className="h-5 w-5"
                        style={{ color: subject?.color_hex ?? "#888" }}
                      />
                    ) : (
                      <Clock3
                        className="h-5 w-5"
                        style={{ color: subject?.color_hex ?? "#888" }}
                      />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate font-bold">
                      <Dot color={subject?.color_hex ?? "#888"} />
                      <span className="truncate">{subject?.name ?? "Unknown subject"}</span>
                    </p>
                    <p className="mt-0.5 text-xs font-medium text-muted">
                      {formatTime(slot.start_time)} – {formatTime(slot.end_time)}
                      {slot.room ? ` · ${slot.room}` : ""}
                    </p>
                  </div>
                  <Badge
                    className={
                      isLab ? "bg-accent-2/15 text-accent-2" : "bg-surface-2 text-muted"
                    }
                  >
                    {isLab ? "lab" : "theory"}
                  </Badge>
                </motion.button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      <SlotSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        slot={editing}
        defaultDayOrder={dayOrder}
      />
    </div>
  );
}
