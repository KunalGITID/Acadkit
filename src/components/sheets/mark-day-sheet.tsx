import { CalendarOff, CheckCheck, XCircle } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { SlotMarkRow } from "@/components/sheets/slot-mark-row";
import { useMarkAttendance, useSettings, useSubjects, useTimetable } from "@/hooks/useData";
import { getDayInfo } from "@/lib/calendar";
import { formatDateLong } from "@/lib/dates";
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
  const mark = useMarkAttendance();

  const info = date ? getDayInfo(date, settings?.declared_holidays ?? []) : null;
  const slots =
    info?.dayOrder != null
      ? (timetable ?? [])
          .filter((s) => s.day_order === info.dayOrder)
          .sort((a, b) => a.start_time.localeCompare(b.start_time))
      : [];

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
          ) : slots.length === 0 ? (
            <EmptyState
              icon={CalendarOff}
              title={`No classes on Day Order ${info.dayOrder}`}
              description="Add class slots in the Timetable tab first."
            />
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
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}
