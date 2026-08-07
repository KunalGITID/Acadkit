import { motion } from "framer-motion";
import { CalendarOff, PartyPopper, Sunrise } from "lucide-react";
import { useToday } from "@/hooks/useToday";
import { daysUntilSemesterStart, semesterWindow } from "@/lib/calendar";
import { useSettings } from "@/hooks/useData";
import { cn } from "@/lib/utils";

/** Compact "today" status: Day Order, holiday, weekend or countdown. */
export function DayOrderChip({ expanded = false }: { expanded?: boolean }) {
  const { info } = useToday();
  const { data: settings } = useSettings();

  let icon: React.ReactNode;
  let label: string;
  let tone = "bg-accent text-white";
  if (info.kind === "working" && info.dayOrder !== null) {
    icon = info.dayOrder;
    label = `Day Order ${info.dayOrder}`;
  } else if (info.kind === "official-holiday" || info.kind === "declared-holiday") {
    icon = <PartyPopper className="h-[18px] w-[18px]" />;
    label = info.holidayName ?? "Holiday";
    tone = "bg-warn/15 text-warn-deep";
  } else if (info.kind === "weekend") {
    icon = <PartyPopper className="h-[18px] w-[18px]" />;
    label = "Weekend";
    tone = "bg-accent-2/15 text-accent-2";
  } else if (info.kind === "pre-semester") {
    const days = daysUntilSemesterStart(info.date, semesterWindow(settings));
    icon = <Sunrise className="h-[18px] w-[18px]" />;
    label = `Semester starts in ${days} day${days === 1 ? "" : "s"}`;
    tone = "bg-warn/15 text-warn-deep";
  } else {
    icon = <CalendarOff className="h-[18px] w-[18px]" />;
    label = "No classes today";
    tone = "bg-surface-2 text-muted";
  }

  // Compact default: just the box — a number or icon, nothing wider. The
  // full "Day Order N" / holiday-name text only shows in the sidebar
  // (expanded), which has the room for it.
  if (!expanded) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        title={label}
        aria-label={label}
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-base font-extrabold shadow-card",
          tone
        )}
      >
        {icon}
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex w-full items-center justify-center gap-2 rounded-2xl border bg-surface px-3 py-2.5 shadow-card"
    >
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold",
          tone
        )}
      >
        {icon}
      </span>
      <span className="truncate text-sm font-bold">{label}</span>
    </motion.div>
  );
}
