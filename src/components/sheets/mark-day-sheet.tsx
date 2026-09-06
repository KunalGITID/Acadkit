import { useState } from "react";
import { CalendarOff, CheckCheck, Plus, XCircle } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { SlotMarkRow } from "@/components/sheets/slot-mark-row";
import {
  useAttendance,
  useMarkAttendance,
  useSettings,
  useSubjects,
  useTimetable,
} from "@/hooks/useData";
import { getDayInfo, semesterWindow } from "@/lib/calendar";
import { formatDateLong } from "@/lib/dates";
import { defaultEndTime, extraClassesFor } from "@/lib/extraClasses";
import { haptic } from "@/lib/utils";

interface MarkDaySheetProps {
  date: string | null;
  onClose: () => void;
}

/** Mark attendance for every class slot on a given date. */
export function MarkDaySheet({ date, onClose }: MarkDaySheetProps) {
  const { data: settings } = useSettings();
  const { data: timetable } = useTimetable();
  const { data: subjects } = useSubjects();
  const { data: attendance } = useAttendance();
  const mark = useMarkAttendance();
  const [adding, setAdding] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [newStart, setNewStart] = useState("16:00");

  const info = date
    ? getDayInfo(date, settings?.declared_holidays ?? [], semesterWindow(settings))
    : null;
  const slots =
    info?.dayOrder != null
      ? (timetable ?? [])
          .filter((s) => s.day_order === info.dayOrder)
          .sort((a, b) => a.start_time.localeCompare(b.start_time))
      : [];

  /**
   * Classes recorded today that the timetable doesn't schedule — a
   * makeup, an extra lab, a swapped slot. Derived rather than stored,
   * so they survive a timetable edit and can't drift out of step with
   * the attendance they're made of.
   */
  const extras =
    date && info?.dayOrder != null
      ? extraClassesFor(date, attendance ?? [], slots, info.dayOrder)
      : [];

  function addExtra() {
    if (!date || !newSubject) return;
    haptic(10);
    mark.mutate({
      subject_id: newSubject,
      date,
      start_time: newStart,
      end_time: defaultEndTime(newStart),
      // Marked present because you only reach for this after sitting
      // through a class that wasn't scheduled; the row's own buttons
      // change it if not.
      status: "present",
    });
    setAdding(false);
    setNewSubject("");
  }

  /**
   * Recording a class the timetable doesn't have. Folded away until
   * asked for: it is the exception, and a permanent form would imply
   * marking a day usually involves typing.
   */
  // A variable, not a nested component: a component declared inside a
  // render is a new type on every render, so React would unmount and
  // remount it between keystrokes and the time field would lose focus
  // as you typed.
  const addExtraForm = !adding ? (
    (
        <button
          type="button"
          onClick={() => {
            haptic();
            setAdding(true);
          }}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed py-3 text-xs font-bold text-muted transition-colors hover:text-ink"
        >
          <Plus className="h-4 w-4" /> Add a class that wasn't scheduled
        </button>
    )
  ) : (
      <div className="space-y-2.5 rounded-2xl border bg-surface-2/40 p-3">
        <select
          value={newSubject}
          onChange={(e) => setNewSubject(e.target.value)}
          aria-label="Subject"
          className="w-full rounded-xl border bg-surface px-3 py-2.5 text-base font-semibold"
        >
          <option value="">Which subject?</option>
          {(subjects ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.code} — {s.name}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-2.5">
          <input
            type="time"
            value={newStart}
            onChange={(e) => setNewStart(e.target.value)}
            aria-label="Start time"
            className="min-w-0 flex-1 rounded-xl border bg-surface px-3 py-2.5 text-base font-semibold"
          />
          <Button onClick={addExtra} disabled={!newSubject} className="shrink-0">
            Add
          </Button>
          <Button variant="secondary" onClick={() => setAdding(false)} className="shrink-0">
            Cancel
          </Button>
        </div>
      </div>
  );

  function markAll(status: "present" | "absent") {
    if (!date) return;
    haptic(status === "present" ? [10, 30, 10] : [8, 30, 8, 30, 8]);
    for (const slot of slots) {
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
    <Sheet
      open={date !== null}
      onOpenChange={(open) => !open && onClose()}
      title={date ? formatDateLong(date) : ""}
      description={
        info?.dayOrder != null
          ? `Day Order ${info.dayOrder} — tap to mark, tap again to clear`
          : undefined
      }
    >
      {date && info && (
        <div className="space-y-2.5">
          {info.dayOrder == null ? (
            <EmptyState
              icon={CalendarOff}
              title={
                info.kind === "weekend"
                  ? "It's a weekend"
                  : info.holidayName ?? "No classes on this day"
              }
              description="There's no Day Order for this date, so there's nothing to mark."
            />
          ) : slots.length === 0 && extras.length === 0 ? (
            <>
              <EmptyState
                icon={CalendarOff}
                title={`No classes on Day Order ${info.dayOrder}`}
                description="Add class slots in the Timetable tab first — or record a one-off class below."
              />
              {addExtraForm}
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2.5 pb-1">
                <Button
                  variant="secondary"
                  className="bg-good/10 text-good-deep hover:bg-good/20"
                  onClick={() => markAll("present")}
                >
                  <CheckCheck className="h-4 w-4" /> Present all day
                </Button>
                <Button
                  variant="secondary"
                  className="bg-bad/10 text-bad-deep hover:bg-bad/20"
                  onClick={() => markAll("absent")}
                >
                  <XCircle className="h-4 w-4" /> Absent all day
                </Button>
              </div>
              {slots.map((slot) => (
                <SlotMarkRow
                  key={slot.id}
                  slot={slot}
                  subject={subjects?.find((s) => s.id === slot.subject_id)}
                  date={date}
                />
              ))}
              {extras.map((slot) => (
                <SlotMarkRow
                  key={slot.id}
                  slot={slot}
                  subject={subjects?.find((s) => s.id === slot.subject_id)}
                  date={date}
                  extra
                />
              ))}
              {addExtraForm}
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}
