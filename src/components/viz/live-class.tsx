import { motion } from "framer-motion";
import { Check, X } from "lucide-react";
import { classProgress, formatGap, liveState, type LiveSlot } from "@/lib/liveClass";
import { formatTimeRange } from "@/lib/dates";
import { say, VOICE } from "@/lib/voice";
import { useTone } from "@/hooks/useTone";
import { cn } from "@/lib/utils";
import type { AttendanceStatus } from "@/types";

/**
 * Where you are in the day, as a single glanceable strip.
 *
 * The class list below already marks the current class with a "now"
 * badge, but you have to read the whole day to find it, and it never
 * says the thing you actually want at 08:20: *how much longer*. This
 * answers that in one line, and puts the two marking buttons on the
 * class you're sitting in, which is the only one you can honestly mark.
 *
 * It renders nothing outside class hours rather than showing a stale
 * "done for the day" strip all evening — an empty state that is always
 * true is just furniture.
 */

interface Props {
  slots: LiveSlot[];
  nowMinutes: number;
  /** Null while the class hasn't been marked yet. */
  statusFor: (slot: LiveSlot) => AttendanceStatus | null;
  onMark: (slot: LiveSlot, status: AttendanceStatus) => void;
  /** Suppressed when the dashboard has rolled forward to tomorrow. */
  disabled?: boolean;
}

export function LiveClassCard({ slots, nowMinutes, statusFor, onMark, disabled }: Props) {
  const tone = useTone();
  const state = liveState(slots, nowMinutes);

  if (disabled || state.kind === "none") return null;

  // Before the first class and after the last, the day list says it
  // better than a countdown does.
  if (state.kind === "done") {
    return (
      <Strip
        label={say(VOICE.dayDone, tone)}
        title={say(VOICE.dayDoneBody, tone)}
        colour="hsl(var(--muted))"
      />
    );
  }

  if (state.kind === "before" || state.kind === "gap") {
    const { next, minutesUntil } = state;
    return (
      <Strip
        label={say(VOICE.upNext, tone)}
        title={next.subject?.name ?? "Unknown subject"}
        colour={next.subject?.color_hex ?? "#888"}
        detail={`${say(VOICE.startsIn, tone, formatGap(minutesUntil))} · ${formatTimeRange(
          next.slot.start_time,
          next.slot.end_time
        )}${next.slot.room ? ` · ${next.slot.room}` : ""}`}
      />
    );
  }

  const { current, minutesLeft } = state;
  const progress = classProgress(state);
  const marked = statusFor(current);

  return (
    <Strip
      label={say(VOICE.inClassNow, tone)}
      title={current.subject?.name ?? "Unknown subject"}
      colour={current.subject?.color_hex ?? "#888"}
      detail={`${say(VOICE.minutesLeft, tone, formatGap(minutesLeft))}${
        current.slot.room ? ` · ${current.slot.room}` : ""
      }`}
      progress={progress}
      action={
        marked ? (
          <span
            className={cn(
              "flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-bold",
              marked === "present" && "bg-good/15 text-good-deep",
              marked === "absent" && "bg-bad/15 text-bad-deep",
              marked === "holiday" && "bg-surface-2 text-muted"
            )}
          >
            {marked === "present" ? <Check className="h-3.5 w-3.5" strokeWidth={2.6} /> : null}
            {marked === "absent" ? <X className="h-3.5 w-3.5" strokeWidth={2.6} /> : null}
            {marked === "holiday" ? "cancelled" : marked}
          </span>
        ) : (
          <div className="flex gap-1.5">
            <button
              onClick={() => onMark(current, "present")}
              aria-label="Mark present"
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-good/15 text-good-deep transition-transform active:scale-90"
            >
              <Check className="h-4 w-4" strokeWidth={2.6} />
            </button>
            <button
              onClick={() => onMark(current, "absent")}
              aria-label="Mark absent"
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-bad/15 text-bad-deep transition-transform active:scale-90"
            >
              <X className="h-4 w-4" strokeWidth={2.6} />
            </button>
          </div>
        )
      }
    />
  );
}

function Strip({
  label,
  title,
  detail,
  colour,
  progress,
  action,
}: {
  label: string;
  title: string;
  detail?: string;
  colour: string;
  progress?: number;
  action?: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden border-b bg-surface-2/40 px-5 py-3.5">
      {/* The bar is the class draining away, so it sits on the bottom
          edge as a rule rather than inside a rounded track — a track
          would read as a stat you're meant to compare. */}
      {progress !== undefined && (
        <motion.div
          className="absolute inset-x-0 bottom-0 h-[3px] origin-left"
          style={{ background: colour }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: progress }}
          transition={{ type: "spring", stiffness: 120, damping: 24 }}
        />
      )}
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="h-8 w-1 shrink-0 rounded-full"
          style={{ background: colour }}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted">{label}</p>
          <p className="line-clamp-1 text-sm font-bold">{title}</p>
          {detail && <p className="truncate text-xs font-medium text-muted">{detail}</p>}
        </div>
        {action}
      </div>
    </div>
  );
}
