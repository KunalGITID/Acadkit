import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { useAddMark, useDeleteMark, useTimetable, useUpdateMark, useUpdateSubject } from "@/hooks/useData";
import { announceComponent } from "@/lib/plan";
import type { Mark, MarkComponentType, PlannedComponent, Subject } from "@/types";
import {
  AUTO_LABEL,
  isLabIntegrated,
  nextComponentLabel,
} from "@/lib/componentLabel";

const INTERNAL_TYPES = ["CT", "Lab", "Assignment", "Project"] as const;

/** "CT-1", "Assignment-2", … */

interface MarkSheetProps {
  open: boolean;
  onClose: () => void;
  subject: Subject | null;
  /** Editing an existing component, or null to add. */
  mark: Mark | null;
  /** The subject's existing internal components (for auto-numbering labels). */
  existing: Mark[];
  /** An announced component to enter the mark for — prefills label and max. */
  announced?: PlannedComponent | null;
}

export function MarkSheet({ open, onClose, subject, mark, existing, announced = null }: MarkSheetProps) {
  const { data: timetable } = useTimetable();
  // Lab-integrated courses name their components FJ/LLJ where theory
  // courses use FT/LLT. See src/lib/componentLabel.ts.
  const labIntegrated = subject ? isLabIntegrated(subject, timetable ?? []) : false;
  const add = useAddMark();
  const update = useUpdateMark();
  const remove = useDeleteMark();
  const updateSubject = useUpdateSubject();

  const [label, setLabel] = useState("");
  const [componentType, setComponentType] = useState<MarkComponentType>("CT");
  const [obtained, setObtained] = useState("");
  const [max, setMax] = useState("");

  const nextLabel = (type: MarkComponentType) =>
    nextComponentLabel(type, labIntegrated, existing);

  useEffect(() => {
    if (!open) return;
    if (mark) {
      setLabel(mark.label);
      setComponentType(mark.component_type);
      setObtained(String(mark.marks_obtained));
      setMax(String(mark.max_marks));
    } else if (announced) {
      setComponentType(announced.type === "External" ? "CT" : announced.type);
      setLabel(announced.label);
      setObtained("");
      setMax(String(announced.max));
    } else {
      setComponentType("CT");
      setLabel(nextLabel("CT"));
      setObtained("");
      setMax("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mark, announced]);

  /**
   * No score yet means announced, not marked: it goes into the subject's
   * plan, so the Targets tab can give it a number to aim at. Only when
   * adding — clearing the score on an existing mark is a mistake, not an
   * announcement — and not for a component that is already announced.
   */
  const announcing = !mark && !announced && obtained.trim() === "";

  function pickType(type: MarkComponentType) {
    setComponentType(type);
    // Keep hand-typed labels; only regenerate ones we generated
    if (!mark && (label === "" || AUTO_LABEL.test(label))) setLabel(nextLabel(type));
  }

  function save() {
    if (!subject) return;
    if (announcing) {
      const result = announceComponent(subject, {
        label,
        type: componentType,
        max: max.trim() === "" ? NaN : Number(max),
      }, existing);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      updateSubject.mutate({ id: subject.id, patch: { assessment: result.assessment } });
      toast.success(`${label.trim()} announced — Targets has a number for it now`);
      onClose();
      return;
    }
    const obt = Number(obtained);
    const mx = Number(max);
    if (!label.trim()) {
      toast.error("Give the component a label");
      return;
    }
    if (!Number.isFinite(obt) || !Number.isFinite(mx) || mx <= 0 || obt < 0 || obt > mx) {
      toast.error("Enter valid marks (obtained ≤ max)");
      return;
    }
    const payload = {
      subject_id: subject.id,
      component_type: componentType,
      label: label.trim(),
      marks_obtained: obt,
      max_marks: mx,
      is_external: false,
    };
    if (mark) update.mutate({ id: mark.id, patch: payload });
    else add.mutate(payload);
    onClose();
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={mark ? "Edit marks" : announced ? `Marks for ${announced.label}` : "Add marks"}
      description={subject ? subject.name : undefined}
    >
      <div className="space-y-4">
        <Field label="Component type">
          <Segmented
            layoutId="mark-component-type"
            options={INTERNAL_TYPES.map((t) => ({ value: t, label: t }))}
            value={componentType}
            onChange={(v) => pickType(v as MarkComponentType)}
          />
        </Field>

        <Field label="Label">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. CT-1"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Obtained">
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              value={obtained}
              onChange={(e) => setObtained(e.target.value)}
              placeholder="0"
              autoFocus={!mark}
            />
          </Field>
          <Field label="Out of">
            <Input
              type="number"
              inputMode="decimal"
              min={1}
              value={max}
              onChange={(e) => setMax(e.target.value)}
              placeholder="15"
            />
          </Field>
        </div>

        {!mark && !announced && (
          <p className="-mt-1 text-xs font-medium text-muted">
            Not marked yet? Leave Obtained blank to announce it — it's added to the plan with a
            target, and you fill in the score when it's back.
          </p>
        )}

        <div className="flex gap-2.5 pt-1">
          {mark && (
            <Button
              variant="danger"
              size="icon"
              className="h-12 w-12 shrink-0 rounded-2xl"
              aria-label="Delete mark"
              onClick={() => {
                remove.mutate(mark.id);
                onClose();
              }}
            >
              <Trash2 className="h-[18px] w-[18px]" />
            </Button>
          )}
          <Button size="lg" className="h-12 flex-1" onClick={save}>
            {mark ? "Save changes" : announcing ? "Announce component" : "Add marks"}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
