import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { useAddDeadline } from "@/hooks/useDeadlines";
import { getLocalDateString } from "@/lib/attendance";
import { cn } from "@/lib/utils";
import type { Deadline, Subject } from "@/types/database";

const DEADLINE_TYPES: Deadline["type"][] = [
  "exam",
  "assignment",
  "lab",
  "other",
];

const PRIORITIES: Deadline["priority"][] = ["low", "medium", "high"];

interface DeadlineSheetProps {
  open: boolean;
  onClose: () => void;
  subjects: Subject[];
  initialDate?: string;
}

export function DeadlineSheet({
  open,
  onClose,
  subjects,
  initialDate,
}: DeadlineSheetProps) {
  const addDeadline = useAddDeadline();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [type, setType] = useState<Deadline["type"]>("assignment");
  const [subjectId, setSubjectId] = useState("");
  const [dueDate, setDueDate] = useState(initialDate ?? getLocalDateString());
  const [dueTime, setDueTime] = useState("");
  const [priority, setPriority] = useState<Deadline["priority"]>("medium");
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setDueDate(initialDate ?? getLocalDateString());
      setError(null);
    }
  }, [initialDate, open]);

  const reset = () => {
    setTitle("");
    setType("assignment");
    setSubjectId("");
    setDueTime("");
    setPriority("medium");
    setErrors({});
  };

  const submit = async () => {
    const newErrors: Record<string, string> = {};
    if (!title.trim() || title.trim().length < 3) {
      newErrors.title = "Title must be at least 3 characters";
    }
    const today = getLocalDateString();
    if (dueDate < today) {
      newErrors.dueDate = "Due date cannot be in the past";
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const due_date = dueTime ? `${dueDate}T${dueTime}:00` : `${dueDate}T23:59:00`;

    try {
      setError(null);
      setErrors({});
      await addDeadline.mutateAsync({
        title: title.trim(),
        type,
        subject_id: subjectId || null,
        due_date,
        priority,
      });
      toast(`${title.trim()} added`);
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add deadline");
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Add Deadline">
      <div className="space-y-4">
        <div>
          <Label>Title</Label>
          <Input
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              if (errors.title) setErrors((prev) => ({ ...prev, title: "" }));
            }}
            placeholder="Lab record submission"
          />
          {errors.title && (
            <p className="mt-1 text-xs text-[#fb7185]">{errors.title}</p>
          )}
        </div>

        <SegmentedControl
          label="Type"
          values={DEADLINE_TYPES}
          value={type}
          onChange={setType}
        />

        <div>
          <Label>Subject</Label>
          <select
            value={subjectId}
            onChange={(event) => setSubjectId(event.target.value)}
            className="mt-1 h-10 w-full rounded-md border border-input bg-[#0a0a0f] px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-[#7c6af7]/50"
          >
            <option value="">No subject</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Due Date</Label>
            <Input
              type="date"
              value={dueDate}
              onChange={(event) => {
                setDueDate(event.target.value);
                if (errors.dueDate) setErrors((prev) => ({ ...prev, dueDate: "" }));
              }}
            />
            {errors.dueDate && (
              <p className="mt-1 text-xs text-[#fb7185]">{errors.dueDate}</p>
            )}
          </div>
          <div>
            <Label>Due Time</Label>
            <Input
              type="time"
              value={dueTime}
              onChange={(event) => setDueTime(event.target.value)}
            />
          </div>
        </div>

        <SegmentedControl
          label="Priority"
          values={PRIORITIES}
          value={priority}
          onChange={setPriority}
        />

        {error && (
          <p className="rounded-md border border-[#fb7185]/30 bg-[#fb7185]/10 px-3 py-2 text-xs text-[#fecdd3]">
            {error}
          </p>
        )}

        <Button
          className="w-full bg-[#7c6af7] text-white hover:bg-[#6b5be0]"
          onClick={submit}
          disabled={addDeadline.isPending}
        >
          Add Deadline
        </Button>
      </div>
    </Sheet>
  );
}

function SegmentedControl<T extends string>({
  label,
  values,
  value,
  onChange,
}: {
  label: string;
  values: T[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1 grid grid-cols-4 gap-1">
        {values.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onChange(item)}
            className={cn(
              "min-h-[36px] rounded-md border px-1 text-center text-[11px] font-medium capitalize transition-colors",
              value === item
                ? "border-[#7c6af7] bg-[#7c6af7]/20 text-[#c4b5fd]"
                : "border-[#1e1e2e] bg-[#0a0a0f] text-muted-foreground"
            )}
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}
