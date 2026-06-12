import { motion } from "framer-motion";
import { CalendarOff, PartyPopper, Sunrise } from "lucide-react";
import { useToday } from "@/hooks/useToday";
import { daysUntilSemesterStart } from "@/lib/calendar";
import { cn } from "@/lib/utils";

/** Compact "today" status: Day Order, holiday, weekend or countdown. */
export function DayOrderChip({ expanded = false }: { expanded?: boolean }) {
  const { info } = useToday();

  let content: React.ReactNode;
  if (info.kind === "working" && info.dayOrder !== null) {
    content = (
      <>
        <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-accent text-sm font-extrabold text-white">
          {info.dayOrder}
        </span>
        <span className="text-sm font-bold">Day Order</span>
      </>
    );
  } else if (info.kind === "official-holiday" || info.kind === "declared-holiday") {
    content = (
      <>
        <PartyPopper className="h-4 w-4 text-warn-deep" />
        <span className="max-w-36 truncate text-sm font-bold">{info.holidayName}</span>
      </>
    );
  } else if (info.kind === "weekend") {
    content = (
      <>
        <PartyPopper className="h-4 w-4 text-accent-2" />
        <span className="text-sm font-bold">Weekend</span>
      </>
    );
  } else if (info.kind === "pre-semester") {
    const days = daysUntilSemesterStart(info.date);
    content = (
      <>
        <Sunrise className="h-4 w-4 text-warn-deep" />
        <span className="text-sm font-bold">
          Sem in {days} day{days === 1 ? "" : "s"}
        </span>
      </>
    );
  } else {
    content = (
      <>
        <CalendarOff className="h-4 w-4 text-muted" />
        <span className="text-sm font-bold">No classes</span>
      </>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        "flex items-center gap-2 rounded-2xl border bg-surface px-3 py-1.5 shadow-card",
        expanded && "w-full justify-center py-2.5"
      )}
    >
      {content}
    </motion.div>
  );
}
