import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { useAddSubject, useDeleteSubject, useUpdateSubject } from "@/hooks/useData";
import { cn } from "@/lib/utils";
import type { Subject } from "@/types";

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
  const add = useAddSubject();
  const update = useUpdateSubject();
  const remove = useDeleteSubject();

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [credits, setCredits] = useState("3");
  const [color, setColor] = useState(PALETTE[0]);
  const [internalOnly, setInternalOnly] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(subject?.name ?? "");
    setCode(subject?.code ?? "");
    setCredits(String(subject?.credits ?? 3));
    setColor(subject?.color_hex ?? PALETTE[0]);
    setInternalOnly(subject?.internal_only ?? false);
  }, [open, subject]);

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
      internal_only: internalOnly,
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
          <Segmented
            layoutId="subject-marks-structure"
            options={[
              { value: "split", label: "Internal 60 + End sem 40" },
              { value: "internal", label: "Internals only (/100)" },
            ]}
            value={internalOnly ? "internal" : "split"}
            onChange={(v) => setInternalOnly(v === "internal")}
          />
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
              onClick={() => {
                if (
                  window.confirm(
                    `Delete ${subject.name}? Its timetable slots, attendance and marks go with it.`
                  )
                ) {
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
