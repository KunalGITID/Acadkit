import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { useAddMark, useDeleteMark, useUpdateMark } from "@/hooks/useData";
import type { Mark, MarkComponentType, Subject } from "@/types";

interface MarkSheetProps {
  open: boolean;
  onClose: () => void;
  subject: Subject | null;
  /** Editing an existing component, or null to add. */
  mark: Mark | null;
  /** When adding: start on the external tab. */
  defaultExternal?: boolean;
}

export function MarkSheet({ open, onClose, subject, mark, defaultExternal }: MarkSheetProps) {
  const add = useAddMark();
  const update = useUpdateMark();
  const remove = useDeleteMark();

  const [isExternal, setIsExternal] = useState(false);
  const [label, setLabel] = useState("");
  const [componentType, setComponentType] = useState<MarkComponentType>("CT");
  const [obtained, setObtained] = useState("");
  const [max, setMax] = useState("");

  useEffect(() => {
    if (!open) return;
    if (mark) {
      setIsExternal(mark.is_external);
      setLabel(mark.label);
      setComponentType(mark.component_type);
      setObtained(String(mark.marks_obtained));
      setMax(String(mark.max_marks));
    } else {
      setIsExternal(defaultExternal ?? false);
      setLabel(defaultExternal ? "End Semester" : "");
      setComponentType(defaultExternal ? "External" : "CT");
      setObtained("");
      setMax(defaultExternal ? "75" : "");
    }
  }, [open, mark, defaultExternal]);

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
      component_type: isExternal ? ("External" as const) : componentType,
      label: label.trim(),
      marks_obtained: obt,
      max_marks: mx,
      is_external: isExternal,
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
      description={subject ? `${subject.name} — internals scale to 60, external to 40` : undefined}
    >
      <div className="space-y-4">
        {!mark && (
          <Segmented
            layoutId="mark-kind"
            options={[
              { value: "internal", label: "Internal" },
              { value: "external", label: "External" },
            ]}
            value={isExternal ? "external" : "internal"}
            onChange={(v) => {
              const ext = v === "external";
              setIsExternal(ext);
              if (ext) {
                setLabel("End Semester");
                setMax("75");
              } else {
                setLabel("");
                setMax("");
              }
            }}
          />
        )}

        <Field label="Label">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={isExternal ? "End Semester" : "e.g. CLA-1"}
          />
        </Field>

        {!isExternal && (
          <Field label="Component type">
            <Segmented
              layoutId="mark-component-type"
              options={(["CT", "Lab", "Assignment", "Project"] as const).map((t) => ({
                value: t,
                label: t,
              }))}
              value={componentType}
              onChange={(v) => setComponentType(v as MarkComponentType)}
            />
          </Field>
        )}

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
              placeholder={isExternal ? "75" : "20"}
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
