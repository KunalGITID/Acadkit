import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { useAddSlot, useDeleteSlot, useSubjects, useUpdateSlot } from "@/hooks/useData";
import type { SubjectType, TimetableSlot } from "@/types";

interface SlotSheetProps {
  open: boolean;
  onClose: () => void;
  /** Editing an existing slot, or null for a new one. */
  slot: TimetableSlot | null;
  /** Pre-selected day order for new slots. */
  defaultDayOrder: number;
}

export function SlotSheet({ open, onClose, slot, defaultDayOrder }: SlotSheetProps) {
  const { data: subjects } = useSubjects();
  const addSlot = useAddSlot();
  const updateSlot = useUpdateSlot();
  const deleteSlot = useDeleteSlot();

  const [subjectId, setSubjectId] = useState("");
  const [dayOrder, setDayOrder] = useState(defaultDayOrder);
  const [slotType, setSlotType] = useState<SubjectType>("theory");
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("08:50");
  const [room, setRoom] = useState("");

  useEffect(() => {
    if (!open) return;
    if (slot) {
      setSubjectId(slot.subject_id);
      setDayOrder(slot.day_order);
      setSlotType(slot.slot_type ?? "theory");
      setStart(slot.start_time.slice(0, 5));
      setEnd(slot.end_time.slice(0, 5));
      setRoom(slot.room ?? "");
    } else {
      setSubjectId(subjects?.[0]?.id ?? "");
      setDayOrder(defaultDayOrder);
      setSlotType("theory");
      setStart("08:00");
      setEnd("08:50");
      setRoom("");
    }
  }, [open, slot, defaultDayOrder, subjects]);

  function save() {
    if (!subjectId) {
      toast.error("Pick a subject first");
      return;
    }
    if (end <= start) {
      toast.error("End time must be after start time");
      return;
    }
    const payload = {
      subject_id: subjectId,
      day_order: dayOrder,
      slot_type: slotType,
      start_time: start,
      end_time: end,
      room: room.trim() || null,
    };
    if (slot) updateSlot.mutate({ id: slot.id, patch: payload });
    else addSlot.mutate(payload);
    onClose();
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={slot ? "Edit class" : "Add class"}
      description={`Day Order ${dayOrder}`}
    >
      <div className="space-y-4">
        <Field label="Subject">
          <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            {(subjects ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Class type">
          <Segmented
            layoutId="slot-kind"
            options={[
              { value: "theory", label: "Theory" },
              { value: "lab", label: "Lab" },
            ]}
            value={slotType}
            onChange={(v) => setSlotType(v as SubjectType)}
          />
        </Field>

        <Field label="Day order">
          <Segmented
            layoutId="slot-day-order"
            options={[1, 2, 3, 4, 5].map((d) => ({ value: d, label: `${d}` }))}
            value={dayOrder}
            onChange={setDayOrder}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts">
            <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Ends">
            <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>

        <Field label="Room (optional)">
          <Input
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            placeholder="e.g. TP-401"
          />
        </Field>

        <div className="flex gap-2.5 pt-1">
          {slot && (
            <Button
              variant="danger"
              size="icon"
              className="h-12 w-12 shrink-0 rounded-2xl"
              aria-label="Delete class"
              onClick={() => {
                deleteSlot.mutate(slot.id);
                onClose();
              }}
            >
              <Trash2 className="h-[18px] w-[18px]" />
            </Button>
          )}
          <Button size="lg" className="h-12 flex-1" onClick={save}>
            {slot ? "Save changes" : "Add class"}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
