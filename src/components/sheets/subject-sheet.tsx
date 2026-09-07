import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { AssessmentEditor } from "@/components/sheets/assessment-editor";
import { editableAssessment, inferType } from "@/lib/plan";
import { isLabIntegrated } from "@/lib/componentLabel";
import { abbreviate } from "@/lib/subjectName";
import { useDialog } from "@/components/ui/dialog";
import { useAddSubject, useDeleteSubject, useTimetable, useUpdateSubject } from "@/hooks/useData";
import { cn } from "@/lib/utils";
import type { Assessment, Subject } from "@/types";

const PALETTE = [
  "#7c6af7", "#f97316", "#22d3ee", "#4ade80",
  "#f472b6", "#facc15", "#fb7185", "#a78bfa",
  "#38bdf8", "#34d399", "#e879f9", "#fbbf24",
];

interface SubjectSheetProps {
  open: boolean;
  onClose: () => void;
  subject: Subject | null;
}

export function SubjectSheet({ open, onClose, subject }: SubjectSheetProps) {
  const { confirm } = useDialog();
  const { data: timetable } = useTimetable();
  const add = useAddSubject();
  const update = useUpdateSubject();
  const remove = useDeleteSubject();

  const [name, setName] = useState("");
  const [shortNameInput, setShortNameInput] = useState("");
  const [code, setCode] = useState("");
  const [credits, setCredits] = useState("3");
  const [color, setColor] = useState(PALETTE[0]);
  const [assessment, setAssessment] = useState<Assessment>(() => editableAssessment(null, false));
  const [medicalLeave, setMedicalLeave] = useState(false);

  /**
   * Load the subject into the form when the sheet opens — and only
   * then.
   *
   * Keyed on the subject's *id*, not the object. `subjects` is a React
   * Query list, so every refetch hands back new object identities:
   * window focus, a realtime event, the settle of any other mutation.
   * Depending on the object meant this effect re-ran while you were
   * typing and reset every field to the server's copy mid-edit, which
   * looks exactly like the app forgetting what you entered.
   */
  useEffect(() => {
    if (!open) return;
    setName(subject?.name ?? "");
    setShortNameInput(subject?.short_name ?? "");
    setCode(subject?.code ?? "");
    setCredits(String(subject?.credits ?? 3));
    setColor(subject?.color_hex ?? PALETTE[0]);
    setAssessment(editableAssessment(subject?.assessment, subject?.internal_only ?? false));
    setMedicalLeave(subject?.medical_leave ?? false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, subject?.id]);

  function save() {
    if (!name.trim() || !code.trim()) {
      toast.error("Name and code are required");
      return;
    }
    const payload = {
      name: name.trim(),
      code: code.trim().toUpperCase(),
      credits: Math.max(0, Math.min(10, Number(credits) || 0)),
      type: "theory" as const,
      faculty: subject?.faculty ?? null,
      color_hex: color,
      // Kept in step with the weight so anything still reading the
      // migration-008 flag (and a device whose 021 hasn't run) agrees
      // with the assessment it now lives beside.
      internal_only: assessment.internal >= 100,
      assessment: {
        ...assessment,
        // Blank rows are half-finished typing, not components.
        components: assessment.components
          .filter((c) => c.label.trim() !== "" && c.max > 0)
          .map((c) => ({ ...c, label: c.label.trim(), type: inferType(c.label) })),
      },
      target_grade: subject?.target_grade ?? null,
      medical_leave: medicalLeave,
      // Blank means "derive it", not "call it nothing".
      short_name: shortNameInput.trim() || null,
    };
    if (subject) update.mutate({ id: subject.id, patch: payload });
    else add.mutate(payload);
    onClose();
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={subject ? "Edit subject" : "Add subject"}
      description={subject ? subject.code : "0-credit subjects are tracked but excluded from SGPA"}
    >
      <div className="space-y-4">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Operating Systems" />
        </Field>
        <Field label="Short name (optional)">
          <Input
            value={shortNameInput}
            onChange={(e) => setShortNameInput(e.target.value)}
            placeholder={name ? abbreviate(name) : "auto"}
            maxLength={12}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Code">
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="21CSC202J" />
          </Field>
          <Field label="Credits">
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              max={10}
              value={credits}
              onChange={(e) => setCredits(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Marks structure">
          <AssessmentEditor
            value={assessment}
            onChange={setAssessment}
            labIntegrated={isLabIntegrated({ id: subject?.id ?? "", code }, timetable ?? [])}
          />
        </Field>

        <Field label="Attendance">
          <label className="flex items-start gap-2.5 rounded-2xl bg-surface-2/40 p-3 text-xs font-medium">
            <input
              type="checkbox"
              checked={medicalLeave}
              onChange={(e) => setMedicalLeave(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--accent))]"
            />
            <span>
              <b className="text-ink">Medical leave granted (ML)</b>
              <span className="mt-0.5 block text-muted">
                Condones the bar for this subject from 75% to 65%. Everything that reads
                attendance — the survival plan, the bunk wallet, whether you can sit the
                end-sem — uses 65% here and leaves your other subjects at 75%.
              </span>
            </span>
          </label>
        </Field>

        <Field label="Color">
          <div className="flex flex-wrap gap-2.5 pt-1">
            {PALETTE.map((c) => (
              <button
                key={c}
                aria-label={`Color ${c}`}
                onClick={() => setColor(c)}
                className={cn(
                  "h-9 w-9 rounded-full transition-transform",
                  color === c && "scale-110 ring-2 ring-ink/60 ring-offset-2 ring-offset-surface"
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </Field>

        <div className="flex gap-2.5 pt-1">
          {subject && (
            <Button
              variant="danger"
              size="icon"
              className="h-12 w-12 shrink-0 rounded-2xl"
              aria-label="Delete subject"
              onClick={async () => {
                const ok = await confirm({
                  title: `Delete ${subject.name}?`,
                  body: "Its timetable slots, attendance and marks go with it.",
                  confirmLabel: "Delete subject",
                  destructive: true,
                });
                if (ok) {
                  remove.mutate(subject.id);
                  onClose();
                }
              }}
            >
              <Trash2 className="h-[18px] w-[18px]" />
            </Button>
          )}
          <Button size="lg" className="h-12 flex-1" onClick={save}>
            {subject ? "Save changes" : "Add subject"}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
