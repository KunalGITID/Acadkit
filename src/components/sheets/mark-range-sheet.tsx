import { useEffect, useMemo, useState } from "react";
import { CalendarRange, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import * as api from "@/api/queries";
import { useAttendance, usePin, useSettings, useSubjects, useTimetable } from "@/hooks/useData";
import { buildEffectiveMap, semesterWindow } from "@/lib/calendar";
import { broadcastInvalidate } from "@/lib/broadcast";
import { describeRangePlan, planRangeMarks } from "@/lib/rangeMark";
import { todayISO } from "@/lib/dates";
import { haptic } from "@/lib/utils";
import type { AttendanceStatus } from "@/types";

interface MarkRangeSheetProps {
  open: boolean;
  onClose: () => void;
  /** Seeds both ends of the range, usually the date you tapped. */
  defaultDate?: string | null;
}

/**
 * Marking a week you were away, in one go.
 *
 * The day sheet is right for the daily case and wrong for the one that
 * actually costs people attendance: five days of six taps each, which
 * doesn't get done, and a fortnight later the number on screen is
 * confidently wrong.
 *
 * Everything consequential is stated before it happens. A bulk write to
 * attendance moves every percentage, budget and projection in the app,
 * so the count and the status appear in a sentence above the button
 * rather than in a toast afterwards — and rows you marked by hand are
 * left alone unless you explicitly ask for them to be replaced.
 */
export function MarkRangeSheet({ open, onClose, defaultDate }: MarkRangeSheetProps) {
  const pin = usePin();
  const qc = useQueryClient();
  const { data: subjects } = useSubjects();
  const { data: timetable } = useTimetable();
  const { data: attendance } = useAttendance();
  const { data: settings } = useSettings();

  const [from, setFrom] = useState(todayISO());
  const [to, setTo] = useState(todayISO());
  const [status, setStatus] = useState<AttendanceStatus>("absent");
  const [subjectId, setSubjectId] = useState("");
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const seed = defaultDate ?? todayISO();
    setFrom(seed);
    setTo(seed);
    setStatus("absent");
    setSubjectId("");
    setReplace(false);
  }, [open, defaultDate]);

  const declared = settings?.declared_holidays;
  const semStart = settings?.sem_start ?? null;
  const semEnd = settings?.sem_end ?? null;
  const effMap = useMemo(
    () =>
      buildEffectiveMap(
        declared ?? [],
        semesterWindow({ sem_start: semStart, sem_end: semEnd })
      ),
    [declared, semStart, semEnd]
  );

  const plan = useMemo(
    () =>
      planRangeMarks({
        from,
        to,
        timetable: timetable ?? [],
        effMap,
        attendance: attendance ?? [],
        subjectId: subjectId || null,
        replace,
      }),
    [from, to, timetable, effMap, attendance, subjectId, replace]
  );

  async function apply() {
    if (!plan.marks.length) return;
    setBusy(true);
    try {
      haptic([10, 40, 14]);
      const n = await api.markRange(pin, plan.marks, status, replace);
      await qc.invalidateQueries();
      broadcastInvalidate(["attendance"]);
      toast.success(`${n} class${n === 1 ? "" : "es"} marked`);
      onClose();
    } catch (err) {
      toast.error("Couldn't mark that range", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title="Mark a range of days"
      description="For the week you were away"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="From">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>

        <Field label="Mark them as">
          <Segmented
            layoutId="range-status"
            options={[
              { value: "absent", label: "Absent" },
              { value: "present", label: "Present" },
              { value: "od", label: "On duty" },
              { value: "holiday", label: "Cancelled" },
            ]}
            value={status}
            onChange={(v) => setStatus(v as AttendanceStatus)}
          />
        </Field>

        <Field label="Subject (optional)">
          <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            <option value="">Every class in the range</option>
            {(subjects ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <p className="mt-1.5 text-[11px] text-muted">
            Missing a week of one lab is more common than missing everything.
          </p>
        </Field>

        {plan.alreadyMarked > 0 && (
          <label className="flex cursor-pointer items-start gap-2.5 rounded-2xl border bg-surface-2/40 p-3">
            <input
              type="checkbox"
              checked={replace}
              onChange={(e) => setReplace(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
            />
            <span className="text-xs">
              <span className="font-bold">Replace what's already marked</span>
              <span className="block text-muted">
                Off by default — an answer you gave by hand outranks a bulk action.
              </span>
            </span>
          </label>
        )}

        {/* The count, before the button rather than in a toast after it. */}
        <p className="rounded-2xl bg-surface-2/40 p-3 text-xs font-semibold">
          {describeRangePlan(plan, status)}
        </p>

        <Button
          size="lg"
          className="h-12 w-full"
          onClick={apply}
          disabled={busy || plan.marks.length === 0}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CalendarRange className="h-4 w-4" />
          )}
          Mark the range
        </Button>
      </div>
    </Sheet>
  );
}
