import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { useAddMark, useDeleteMark, useUpdateMark } from "@/hooks/useData";
import type { Mark, MarkComponentType, Subject } from "@/types";

const INTERNAL_TYPES = ["CT", "Lab", "Assignment", "Project"] as const;

/** "CT-1", "Assignment-2", … */
const AUTO_LABEL = /^(CT|Lab|Assignment|Project)-\d+$/;

interface MarkSheetProps {
  open: boolean;
  onClose: () => void;
  subject: Subject | null;
  /** Editing an existing component, or null to add. */
  mark: Mark | null;
  /** The subject's existing internal components (for auto-numbering labels). */
  existing: Mark[];
}

export function MarkSheet({ open, onClose, subject, mark, existing }: MarkSheetProps) {
  const add = useAddMark();
  const update = useUpdateMark();
  const remove = useDeleteMark();

  const [label, setLabel] = useState("");
  const [componentType, setComponentType] = useState<MarkComponentType>("CT");
  const [obtained, setObtained] = useState("");
  const [max, setMax] = useState("");

  function nextLabel(type: MarkComponentType): string {
    const count = existing.filter((m) => !m.is_external && m.component_type === type).length;
    return `${type}-${count + 1}`;
  }

  useEffect(() => {
    if (!open) return;
    if (mark) {
      setLabel(mark.label);
      setComponentType(mark.component_type);
      setObtained(String(mark.marks_obtained));
      setMax(String(mark.max_marks));
    } else {
      setComponentType("CT");
      setLabel(nextLabel("CT"));
      setObtained("");
      setMax("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mark]);

  function pickType(type: MarkComponentType) {
    setComponentType(type);
    // Keep hand-typed labels; only regenerate ones we generated
    if (!mark && (label === "" || AUTO_LABEL.test(label))) setLabel(nextLabel(type));
  }

  function save() {
    if (!subject) return;
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
      title={mark ? "Edit marks" : "Add marks"}
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
            {mark ? "Save changes" : "Add marks"}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
