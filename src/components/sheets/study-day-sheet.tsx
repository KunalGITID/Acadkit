import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Minus, Plus } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Dot } from "@/components/ui/misc";
import { studyDayRows, useSaveStudyDay, useStudyLog, useSubjects } from "@/hooks/useData";
import { evenSplit, formatMinutes } from "@/lib/studyLog";
import { formatDate, todayISO } from "@/lib/dates";
import { abbreviate } from "@/lib/subjectName";
import type { Subject } from "@/types";

const shortName = (s: Subject) => s.short_name || abbreviate(s.name);
import { cn } from "@/lib/utils";

const QUICK = [0, 30, 60, 90, 120, 180, 240];
const STEP = 15;

function Stepper({
  value,
  onChange,
  label,
  min = 0,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
  min?: number;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        aria-label={`Less ${label}`}
        onClick={() => onChange(Math.max(min, value - STEP))}
        className="grid h-9 w-9 place-items-center rounded-xl bg-surface-2 text-ink disabled:opacity-40"
        disabled={value <= min}
      >
        <Minus className="h-4 w-4" />
      </button>
      <span className="w-16 text-center text-sm font-extrabold tabular">{formatMinutes(value)}</span>
      <button
        type="button"
        aria-label={`More ${label}`}
        onClick={() => onChange(Math.min(1440, value + STEP))}
        className="grid h-9 w-9 place-items-center rounded-xl bg-surface-2 text-ink"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

/**
 * How long you studied on one day, and on what.
 *
 * Two questions, the second only if the first isn't zero: a total, then
 * which subjects it went on. Picking subjects splits the total evenly
 * (two hours over OS and AOOP opens as an hour each) and the steppers
 * move it from there; it saves once the split adds back up, so the day's
 * total and its subjects can never disagree.
 */
export function StudyDaySheet({ date, onClose }: { date: string | null; onClose: () => void }) {
  const { data: subjects } = useSubjects();
  const { data: log } = useStudyLog();
  const save = useSaveStudyDay();

  const [total, setTotal] = useState(0);
  const [split, setSplit] = useState<Array<{ subject_id: string; minutes: number }>>([]);

  // Open on what's already recorded for the day, so this doubles as the editor.
  useEffect(() => {
    if (!date) return;
    const rows = (log ?? []).filter((e) => e.date === date && e.subject_id && e.minutes > 0);
    setSplit(rows.map((e) => ({ subject_id: e.subject_id!, minutes: e.minutes })));
    setTotal(rows.reduce((s, e) => s + e.minutes, 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const assigned = split.reduce((s, r) => s + r.minutes, 0);
  const balanced = total === 0 || (split.length > 0 && assigned === total);

  function changeTotal(next: number) {
    setTotal(next);
    setSplit((cur) => {
      if (next === 0) return [];
      const shares = evenSplit(next, cur.length);
      return cur.map((r, i) => ({ ...r, minutes: shares[i] }));
    });
  }

  function toggleSubject(id: string) {
    setSplit((cur) => {
      const next = cur.some((r) => r.subject_id === id)
        ? cur.filter((r) => r.subject_id !== id)
        : [...cur, { subject_id: id, minutes: 0 }];
      const shares = evenSplit(total, next.length);
      return next.map((r, i) => ({ ...r, minutes: shares[i] }));
    });
  }

  const byId = useMemo(() => new Map((subjects ?? []).map((s) => [s.id, s])), [subjects]);

  function submit() {
    if (!date || !balanced) return;
    save.mutate(studyDayRows({ date, entries: total === 0 ? [] : split }));
    toast.success(
      total === 0
        ? "Logged a rest day"
        : `Logged ${formatMinutes(total)} — ${split
            .filter((r) => r.minutes > 0)
            .map((r) => `${byId.get(r.subject_id) ? shortName(byId.get(r.subject_id)!) : "?"} ${formatMinutes(r.minutes)}`)
            .join(", ")}`
    );
    onClose();
  }

  const isToday = date === todayISO();

  return (
    <Sheet
      open={date !== null}
      onOpenChange={(o) => !o && onClose()}
      title={isToday ? "How much did you study today?" : "How much did you study?"}
      description={date ? formatDate(date, { weekday: "long", day: "numeric", month: "short" }) : undefined}
    >
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-muted">In total</span>
          <Stepper value={total} onChange={changeTotal} label="time in total" />
        </div>
        <div className="flex flex-wrap gap-2">
          {QUICK.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => changeTotal(m)}
              className={cn(
                "rounded-xl px-3 py-2 text-xs font-bold tabular transition-colors",
                total === m ? "bg-accent text-white" : "bg-surface-2 text-ink"
              )}
            >
              {m === 0 ? "None" : formatMinutes(m)}
            </button>
          ))}
        </div>

        {total > 0 && (
          <div className="space-y-2.5">
            <p className="text-sm font-semibold text-muted">On what?</p>
            <div className="flex flex-wrap gap-2">
              {(subjects ?? []).map((s) => {
                const on = split.some((r) => r.subject_id === s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleSubject(s.id)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition-colors",
                      on ? "border-transparent bg-accent text-white" : "bg-surface-2/50 text-ink"
                    )}
                  >
                    <Dot color={s.color_hex} className="h-1.5 w-1.5" />
                    {shortName(s)}
                  </button>
                );
              })}
            </div>

            {split.length > 1 &&
              split.map((r) => {
                const s = byId.get(r.subject_id);
                return (
                  <div key={r.subject_id} className="flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                      <Dot color={s?.color_hex ?? "#888"} className="shrink-0" />
                      <span className="truncate">{s?.name ?? "Subject"}</span>
                    </span>
                    <Stepper
                      value={r.minutes}
                      label={`time on ${s ? shortName(s) : "this subject"}`}
                      onChange={(v) =>
                        setSplit((cur) => cur.map((x) => (x.subject_id === r.subject_id ? { ...x, minutes: v } : x)))
                      }
                    />
                  </div>
                );
              })}

            {split.length === 0 ? (
              <p className="text-xs font-medium text-muted">Pick one or more — the time is split between them.</p>
            ) : (
              split.length > 1 &&
              !balanced && (
                <p className="text-xs font-bold text-warn-deep">
                  {formatMinutes(assigned)} of {formatMinutes(total)} split —{" "}
                  {assigned < total
                    ? `${formatMinutes(total - assigned)} still to place`
                    : `${formatMinutes(assigned - total)} too many`}
                </p>
              )
            )}
          </div>
        )}

        <Button size="lg" className="h-12 w-full" onClick={submit} disabled={!balanced}>
          {total === 0 ? "Didn't study" : `Save ${formatMinutes(total)}`}
        </Button>
      </div>
    </Sheet>
  );
}
