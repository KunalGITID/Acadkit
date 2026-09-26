import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { BookOpenCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StudyDaySheet } from "@/components/sheets/study-day-sheet";
import { studyDayRows, useSaveStudyDay, useStudyLog } from "@/hooks/useData";
import { studyPromptDate } from "@/lib/studyLog";

const SKIP_KEY = "acadkit:study-skip";

function readSkipped(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SKIP_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

/**
 * Once a day: how much did you study?
 *
 * Asked on Home rather than as a pop-up, because it's the page opened
 * every day and a pop-up in front of the timetable is in the way of the
 * reason you opened the app. It asks about today from the evening and
 * about yesterday before then (src/lib/studyLog.ts), and disappears once
 * answered. "Later" is per day and stays on this device — it's a
 * convenience, not a record; the record is the answer.
 */
export function StudyCheckIn() {
  const { data: log, isLoading } = useStudyLog();
  const save = useSaveStudyDay();
  const [skipped, setSkipped] = useState(readSkipped);
  const [open, setOpen] = useState<string | null>(null);

  const ask = useMemo(() => studyPromptDate(log ?? [], new Date(), skipped), [log, skipped]);

  function later(date: string) {
    const next = new Set(skipped).add(date);
    setSkipped(next);
    try {
      // Only the last few days matter; don't let the list grow forever.
      localStorage.setItem(SKIP_KEY, JSON.stringify([...next].sort().slice(-7)));
    } catch {
      // Storage off: it just asks again next time.
    }
  }

  if (isLoading || !ask) return <StudyDaySheet date={open} onClose={() => setOpen(null)} />;

  return (
    <>
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="card p-5"
      >
        <p className="flex items-center gap-2 font-bold">
          <BookOpenCheck className="h-4 w-4 text-accent" />
          How much did you study {ask.which}?
        </p>
        <p className="mt-1 text-xs font-medium text-muted">
          Takes five seconds, and it goes in your study log.
        </p>
        <div className="mt-3 flex gap-2">
          <Button className="flex-1" onClick={() => setOpen(ask.date)}>
            Log it
          </Button>
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => save.mutate(studyDayRows({ date: ask.date, entries: [] }))}
          >
            Didn't study
          </Button>
          <Button variant="ghost" onClick={() => later(ask.date)}>
            Later
          </Button>
        </div>
      </motion.section>
      <StudyDaySheet date={open} onClose={() => setOpen(null)} />
    </>
  );
}
