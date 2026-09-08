import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import {
  useAddDeadline,
  useDeleteDeadline,
  useSettings,
  useSubjects,
  useTimetable,
  useUpdateDeadline,
} from "@/hooks/useData";
import { derivedTitle } from "@/lib/deadlines";
import { assessmentFor, normLabel } from "@/lib/plan";
import { getDayInfo, semesterWindow } from "@/lib/calendar";
import { todayISO } from "@/lib/dates";
import { DEFAULT_DUE_TIME, describeDueTime, suggestDueTime } from "@/lib/dueTime";
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
  const { data: timetable } = useTimetable();
  const { data: settings } = useSettings();
  const add = useAddDeadline();
  const update = useUpdateDeadline();
  const remove = useDeleteDeadline();

  const [subjectId, setSubjectId] = useState<string>("");
  const [type, setType] = useState<DeadlineType>("assignment");
  const [priority, setPriority] = useState<DeadlinePriority>("medium");
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState(DEFAULT_DUE_TIME);
  /** Once you set a time by hand, the timetable stops overriding it. */
  const [timeTouched, setTimeTouched] = useState(false);
  const [maxMarks, setMaxMarks] = useState("");
  /** Key of the planned component this deadline is, or "" for none. */
  const [componentKey, setComponentKey] = useState("");

  useEffect(() => {
    if (!open) return;
    if (deadline) {
      const due = new Date(deadline.due_date);
      setSubjectId(deadline.subject_id ?? "");
      setType(deadline.type);
      setPriority(deadline.priority);
      setDate(
        `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}`
      );
      setTime(
        `${String(due.getHours()).padStart(2, "0")}:${String(due.getMinutes()).padStart(2, "0")}`
      );
      setMaxMarks(deadline.max_marks != null ? String(deadline.max_marks) : "");
      // An existing deadline's time was chosen once already; re-deriving
      // it on open would quietly move a date you had settled.
      setTimeTouched(true);
      // Re-select the component this deadline names, so editing doesn't
      // silently demote it back to a free-standing test.
      const owner = (subjects ?? []).find((s) => s.id === deadline.subject_id);
      const match = owner
        ? assessmentFor(owner).components.find(
            (c) => normLabel(c.label) === normLabel(deadline.title)
          )
        : undefined;
      setComponentKey(match?.key ?? "");
    } else {
      setSubjectId("");
      setType("assignment");
      setPriority("medium");
      setDate(defaultDate ?? todayISO());
      setTime(DEFAULT_DUE_TIME);
      setTimeTouched(false);
      setMaxMarks("");
      setComponentKey("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, deadline, defaultDate]);

  const subject = (subjects ?? []).find((s) => s.id === subjectId);
  const components = subject ? assessmentFor(subject).components : [];
  const picked = components.find((c) => c.key === componentKey);

  /**
   * The due time the timetable implies, refreshed as you pick a
   * subject, a type or a date.
   *
   * Depends on the two settings fields rather than the settings object,
   * for the reason `useToday` gives: React Query hands back a new object
   * on every refetch, so listing it would defeat the memo and rebuild
   * the day-order map on every keystroke.
   */
  const declared = settings?.declared_holidays;
  const semStart = settings?.sem_start ?? null;
  const semEnd = settings?.sem_end ?? null;
  const dayOrder = useMemo(
    () =>
      getDayInfo(date, declared ?? [], semesterWindow({ sem_start: semStart, sem_end: semEnd }))
        .dayOrder,
    [date, declared, semStart, semEnd]
  );
  const suggestion = useMemo(
    () => suggestDueTime(type, subjectId || null, dayOrder, timetable ?? []),
    [type, subjectId, dayOrder, timetable]
  );

  useEffect(() => {
    if (!open || timeTouched) return;
    setTime(suggestion ? suggestion.time : DEFAULT_DUE_TIME);
  }, [open, timeTouched, suggestion]);

  /**
   * Point a deadline at a component you have already declared.
   *
   * Without this the title is derived — "21CSS202T Exam" — which
   * matches no component, so a 15-mark exam looked like a *sixth*
   * component on a plan that was already full. Naming the component is
   * what turns a deadline into a date for something the budget knows
   * about rather than another thing to find room for.
   *
   * The marks are prefilled and stay editable, because a component is
   * not always assessed in one sitting: an LLJ worth 10 can arrive two
   * marks at a time across the term, and each of those is its own
   * deadline against the same component.
   */
  function pickComponent(key: string) {
    setComponentKey(key);
    const c = components.find((x) => x.key === key);
    if (c) setMaxMarks(String(c.max));
  }

  function save() {
    const due = new Date(`${date}T${time}:00`);
    const payload = {
      // `title` is NOT NULL and appears in the JSON export, so it's
      // derived rather than dropped now the field is gone.
      // Naming the component is what lets the budget match this to a
      // row it already has, instead of treating it as a new one.
      title: picked ? picked.label : derivedTitle(type, subject),
      subject_id: subjectId || null,
      type,
      priority,
      due_date: due.toISOString(),
      status: deadline?.status ?? ("pending" as const),
      // Blank means "no marks attached", not zero — a lab record has no
      // denominator and shouldn't be made to invent one.
      max_marks: maxMarks.trim() ? Number(maxMarks) : null,
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

        {components.length > 0 && (
          <Field label="Which component?">
            <Select value={componentKey} onChange={(e) => pickComponent(e.target.value)}>
              <option value="">Not one of the planned components</option>
              {components.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label} · {c.max} marks
                </option>
              ))}
            </Select>
            <p className="mt-1.5 text-[11px] text-muted">
              Picking one dates a component the plan already has, instead of adding another.
              Change the marks below if this is only part of it.
            </p>
          </Field>
        )}

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

        <Field label="Out of (optional)">
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            placeholder="e.g. 50 — leave blank if it carries no marks"
            value={maxMarks}
            onChange={(e) => setMaxMarks(e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Due date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Time">
            <Input
              type="time"
              value={time}
              onChange={(e) => {
                setTime(e.target.value);
                setTimeTouched(true);
              }}
            />
            {suggestion && !timeTouched && (
              <p className="mt-1.5 text-[11px] text-muted">{describeDueTime(suggestion)}</p>
            )}
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
