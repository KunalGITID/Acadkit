import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import {
  useAddDeadline,
  useDeleteDeadline,
  useSubjects,
  useUpdateDeadline,
} from "@/hooks/useData";
import { todayISO } from "@/lib/dates";
import type { Deadline, DeadlinePriority, DeadlineType } from "@/types";

interface DeadlineSheetProps {
  open: boolean;
  onClose: () => void;
  deadline: Deadline | null;
  /** Pre-fill the date (e.g. from the calendar page). */
  defaultDate?: string;
}

export function DeadlineSheet({ open, onClose, deadline, defaultDate }: DeadlineSheetProps) {
  const { data: subjects } = useSubjects();
  const add = useAddDeadline();
  const update = useUpdateDeadline();
  const remove = useDeleteDeadline();

  const [title, setTitle] = useState("");
  const [subjectId, setSubjectId] = useState<string>("");
  const [type, setType] = useState<DeadlineType>("assignment");
  const [priority, setPriority] = useState<DeadlinePriority>("medium");
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState("23:59");

  useEffect(() => {
    if (!open) return;
    if (deadline) {
      const due = new Date(deadline.due_date);
      setTitle(deadline.title);
      setSubjectId(deadline.subject_id ?? "");
      setType(deadline.type);
      setPriority(deadline.priority);
      setDate(
        `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}`
      );
      setTime(
        `${String(due.getHours()).padStart(2, "0")}:${String(due.getMinutes()).padStart(2, "0")}`
      );
    } else {
      setTitle("");
      setSubjectId("");
      setType("assignment");
      setPriority("medium");
      setDate(defaultDate ?? todayISO());
      setTime("23:59");
    }
  }, [open, deadline, defaultDate]);

  function save() {
    if (!title.trim()) {
      toast.error("Give it a title");
      return;
    }
    const due = new Date(`${date}T${time}:00`);
    const payload = {
      title: title.trim(),
      subject_id: subjectId || null,
      type,
      priority,
      due_date: due.toISOString(),
      status: deadline?.status ?? ("pending" as const),
    };
    if (deadline) update.mutate({ id: deadline.id, patch: payload });
    else add.mutate(payload);
    onClose();
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={deadline ? "Edit deadline" : "New deadline"}
    >
      <div className="space-y-4">
        <Field label="Title">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. DSA Assignment 3"
            autoFocus={!deadline}
          />
        </Field>

        <Field label="Subject (optional)">
          <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            <option value="">No subject</option>
            {(subjects ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Type">
          <Segmented
            layoutId="deadline-type"
            options={[
              { value: "assignment", label: "Assignment" },
              { value: "exam", label: "Exam" },
              { value: "lab", label: "Lab" },
              { value: "other", label: "Other" },
            ]}
            value={type}
            onChange={(v) => setType(v as DeadlineType)}
          />
        </Field>

        <Field label="Priority">
          <Segmented
            layoutId="deadline-priority"
            options={[
              { value: "low", label: "Low" },
              { value: "medium", label: "Medium" },
              { value: "high", label: "High" },
            ]}
            value={priority}
            onChange={(v) => setPriority(v as DeadlinePriority)}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Due date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Time">
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>

        <div className="flex gap-2.5 pt-1">
          {deadline && (
            <Button
              variant="danger"
              size="icon"
              className="h-12 w-12 shrink-0 rounded-2xl"
              aria-label="Delete deadline"
              onClick={() => {
                remove.mutate(deadline.id);
                onClose();
              }}
            >
              <Trash2 className="h-[18px] w-[18px]" />
            </Button>
          )}
          <Button size="lg" className="h-12 flex-1" onClick={save}>
            {deadline ? "Save changes" : "Add deadline"}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
