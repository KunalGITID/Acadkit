import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Ban, Check, ChevronDown, X } from "lucide-react";
import { useAttendance, useMarkAttendance, useUnmarkAttendance } from "@/hooks/useData";
import { formatTimeRange } from "@/lib/dates";
import { cn, haptic } from "@/lib/utils";
import { Dot } from "@/components/ui/misc";
import type { AttendanceStatus, Subject, TimetableSlot } from "@/types";

const OPTIONS: Array<{
  status: AttendanceStatus;
  label: string;
  icon: typeof Check;
  activeClass: string;
  chipClass: string;
}> = [
  {
    status: "present",
    label: "Present",
    icon: Check,
    activeClass: "bg-good text-emerald-950",
    chipClass: "bg-good/15 text-good-deep",
  },
  {
    status: "absent",
    label: "Absent",
    icon: X,
    activeClass: "bg-bad text-rose-950",
    chipClass: "bg-bad/15 text-bad-deep",
  },
  {
    status: "holiday",
    label: "Off",
    icon: Ban,
    activeClass: "bg-surface-2 text-muted ring-1 ring-inset ring-ink/15",
    chipClass: "bg-surface-2 text-muted",
  },
];

interface SlotMarkRowProps {
  slot: TimetableSlot;
  subject: Subject | undefined;
  date: string;
  /**
   * Compact mode for the dashboard: one status button that expands
   * into the three options on tap, instead of always-visible buttons.
   */
  collapsible?: boolean;
}

/** One class slot with Present / Absent / Cancelled marking. */
export function SlotMarkRow({ slot, subject, date, collapsible = false }: SlotMarkRowProps) {
  const { data: attendance } = useAttendance();
  const mark = useMarkAttendance();
  const unmark = useUnmarkAttendance();
  const [open, setOpen] = useState(false);

  const record = attendance?.find(
    (r) =>
      r.subject_id === slot.subject_id && r.date === date && r.start_time === slot.start_time
  );
  const active = OPTIONS.find((o) => o.status === record?.status);

  function toggle(status: AttendanceStatus) {
    haptic(status === "present" ? 10 : [8, 30, 8]);
    if (record?.status === status) {
      unmark.mutate({ subject_id: slot.subject_id, date, start_time: slot.start_time });
    } else {
      mark.mutate({
        subject_id: slot.subject_id,
        date,
        start_time: slot.start_time,
        end_time: slot.end_time,
        status,
      });
    }
    setOpen(false);
  }

  const optionButtons = (
    <div className="flex shrink-0 gap-1.5">
      {OPTIONS.map((opt) => {
        const isActive = record?.status === opt.status;
        return (
          <motion.button
            key={opt.status}
            whileTap={{ scale: 0.88 }}
            onClick={() => toggle(opt.status)}
            aria-label={`${opt.label} — ${subject?.name ?? "class"}`}
            aria-pressed={isActive}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-xl transition-all",
              isActive ? opt.activeClass : "border bg-surface text-muted hover:text-ink"
            )}
          >
            <opt.icon className="h-4 w-4" strokeWidth={2.5} />
          </motion.button>
        );
      })}
    </div>
  );

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center justify-between gap-3 rounded-2xl border bg-surface-2/40 p-3"
    >
      <div className="flex min-w-0 items-center gap-3">
        <Dot color={subject?.color_hex ?? "#888"} />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">{subject?.name ?? "Unknown subject"}</p>
          <p className="truncate text-xs font-medium text-muted">
            {slot.slot_type === "lab" ? "Lab · " : ""}
            {formatTimeRange(slot.start_time, slot.end_time)}
            {slot.room ? ` · ${slot.room}` : ""}
          </p>
        </div>
      </div>

      {!collapsible ? (
        optionButtons
      ) : (
        <AnimatePresence mode="popLayout" initial={false}>
          {open ? (
            <motion.div
              key="options"
              initial={{ opacity: 0, x: 16, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 16, scale: 0.9 }}
              transition={{ type: "spring", stiffness: 420, damping: 30 }}
            >
              {optionButtons}
            </motion.div>
          ) : (
            <motion.button
              key="chip"
              initial={{ opacity: 0, x: -10, scale: 0.92 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -10, scale: 0.92 }}
              transition={{ type: "spring", stiffness: 420, damping: 30 }}
              whileTap={{ scale: 0.94 }}
              onClick={() => {
                haptic();
                setOpen(true);
              }}
              aria-label={
                active
                  ? `${active.label} — ${subject?.name ?? "class"}, tap to change`
                  : `Mark attendance — ${subject?.name ?? "class"}`
              }
              className={cn(
                "flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-xs font-bold transition-colors",
                active ? active.chipClass : "border bg-surface text-muted hover:text-ink"
              )}
            >
              {active ? (
                <>
                  <active.icon className="h-3.5 w-3.5" strokeWidth={2.5} />
                  {active.label}
                </>
              ) : (
                <>
                  Mark
                  <ChevronDown className="h-3.5 w-3.5" />
                </>
              )}
            </motion.button>
          )}
        </AnimatePresence>
      )}
    </motion.div>
  );
}
