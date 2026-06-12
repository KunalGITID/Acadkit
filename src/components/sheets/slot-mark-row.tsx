import { motion } from "framer-motion";
import { Ban, Check, X } from "lucide-react";
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
}> = [
  { status: "present", label: "Present", icon: Check, activeClass: "bg-good text-emerald-950" },
  { status: "absent", label: "Absent", icon: X, activeClass: "bg-bad text-rose-950" },
  { status: "holiday", label: "Cancelled", icon: Ban, activeClass: "bg-surface-2 text-muted ring-1 ring-inset ring-ink/15" },
];

interface SlotMarkRowProps {
  slot: TimetableSlot;
  subject: Subject | undefined;
  date: string;
}

/** One class slot with Present / Absent / Cancelled toggles (tap again to clear). */
export function SlotMarkRow({ slot, subject, date }: SlotMarkRowProps) {
  const { data: attendance } = useAttendance();
  const mark = useMarkAttendance();
  const unmark = useUnmarkAttendance();

  const record = attendance?.find(
    (r) =>
      r.subject_id === slot.subject_id && r.date === date && r.start_time === slot.start_time
  );

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
  }

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
          <p className="text-xs font-medium text-muted">
            {slot.slot_type === "lab" ? "Lab · " : ""}
            {formatTimeRange(slot.start_time, slot.end_time)}
            {slot.room ? ` · ${slot.room}` : ""}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 gap-1.5">
        {OPTIONS.map((opt) => {
          const active = record?.status === opt.status;
          return (
            <motion.button
              key={opt.status}
              whileTap={{ scale: 0.88 }}
              onClick={() => toggle(opt.status)}
              aria-label={`${opt.label} — ${subject?.name ?? "class"}`}
              aria-pressed={active}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-xl transition-all",
                active ? opt.activeClass : "bg-surface text-muted hover:text-ink border"
              )}
            >
              <opt.icon className="h-4 w-4" strokeWidth={2.5} />
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
}
