import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Dot } from "@/components/ui/misc";
import { countdownLabel, examUrgency, nextExam } from "@/lib/examCountdown";
import { deadlineTarget, describeTarget } from "@/lib/deadlineTarget";
import { deadlineLabel } from "@/lib/deadlines";
import { formatDate } from "@/lib/dates";
import { say, VOICE } from "@/lib/voice";
import { useTone } from "@/hooks/useTone";
import { useDeadlines, useMarks, useSubjects } from "@/hooks/useData";
import { cn } from "@/lib/utils";

/**
 * A countdown to the next exam, and the score that would move your grade.
 *
 * Exams are the one deadline type entered entirely by hand — the portal
 * never publishes their dates — and the reason to enter one is to aim at
 * a number and practise toward it. The app already knew that number
 * (`deadlineTarget`), but only showed it as a caption on a list row,
 * which is where you look when you are managing deadlines rather than
 * revising for one.
 *
 * It renders nothing when no exam is near. A permanent banner stops being
 * read inside a week; one that appears three weeks out is an event.
 */
export function ExamCountdown() {
  const tone = useTone();
  const { data: deadlines } = useDeadlines();
  const { data: subjects } = useSubjects();
  const { data: marks } = useMarks();

  const upcoming = nextExam(deadlines);
  if (!upcoming) return null;

  const { deadline, daysAway } = upcoming;
  const subject = subjects?.find((s) => s.id === deadline.subject_id);
  const urgency = examUrgency(daysAway);

  const target = deadlineTarget(
    deadline,
    (marks ?? []).filter((m) => m.subject_id === deadline.subject_id)
  );
  const advice = target ? describeTarget(target, Number(deadline.max_marks)) : null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 26 }}
      className={cn(
        "card relative overflow-hidden p-5",
        urgency === "imminent" && "ring-2 ring-bad/40",
        urgency === "near" && "ring-1 ring-warn/40"
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted">
            {say(VOICE.examLabel, tone)}
          </p>
          <p className="mt-1 flex items-start gap-2 text-lg font-extrabold">
            {subject && <Dot color={subject.color_hex} className="mt-2 shrink-0" />}
            <span className="line-clamp-2">{deadlineLabel(deadline, subject)}</span>
          </p>
          <p className="mt-0.5 text-xs font-medium text-muted">
            {formatDate(deadline.due_date.slice(0, 10), {
              weekday: "short",
              day: "numeric",
              month: "long",
            })}
            {deadline.max_marks ? ` · out of ${deadline.max_marks}` : ""}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p
            className={cn(
              "text-3xl font-extrabold leading-none tabular",
              urgency === "imminent" && "text-bad-deep",
              urgency === "near" && "text-warn-deep"
            )}
          >
            {countdownLabel(daysAway)}
          </p>
        </div>
      </div>

      {/* The whole reason the date was typed in: what to aim for. */}
      <div className="mt-4 border-t pt-3">
        {daysAway === 0 ? (
          <p className="text-sm font-bold">{say(VOICE.examToday, tone)}</p>
        ) : advice ? (
          <p className="text-sm font-bold text-accent">{advice}</p>
        ) : !Number(deadline.max_marks) ? (
          // No mark total: the fix is on the deadline itself.
          <Link
            to="/calendar"
            className="flex items-center gap-1.5 text-sm font-semibold text-muted"
          >
            {say(VOICE.examNoMaxMarks, tone)}
            <ArrowRight className="h-3.5 w-3.5 shrink-0" />
          </Link>
        ) : (
          // A mark total exists but the subject has no marks to set a pace
          // from, so the fix is in Marks — sending you to the deadline
          // would be sending you to fix something that isn't broken.
          <Link
            to="/marks"
            className="flex items-center gap-1.5 text-sm font-semibold text-muted"
          >
            {say(VOICE.examNoPace, tone)}
            <ArrowRight className="h-3.5 w-3.5 shrink-0" />
          </Link>
        )}
      </div>
    </motion.section>
  );
}
