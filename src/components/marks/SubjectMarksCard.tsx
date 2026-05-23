import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Collapsible } from "@/components/ui/collapsible";
import { GradeBadge } from "@/components/ui/grade-badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MarksProgress } from "@/components/ui/marks-progress";
import {
  useAddMark,
  useDeleteMark,
  useSubjectMarksDetail,
} from "@/hooks/useMarks";
import {
  COMPONENT_BADGE,
  defaultMaxMarks,
  formatAddedAt,
  suggestLabel,
} from "@/lib/marks-helpers";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import type { Mark, MarkComponentType, Subject } from "@/types/database";

const INTERNAL_TYPES: Exclude<MarkComponentType, "External">[] = [
  "CT",
  "Lab",
  "Assignment",
  "Project",
];

function getMutationErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return fallback;
}

function formatMarkValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

interface SubjectMarksCardProps {
  subject: Subject;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SubjectMarksCard({
  subject,
  open,
  onOpenChange,
}: SubjectMarksCardProps) {
  const detail = useSubjectMarksDetail(subject.id);
  const addMark = useAddMark();
  const deleteMark = useDeleteMark();
  const { toast } = useToast();

  const [showInternalForm, setShowInternalForm] = useState(false);
  const [showExternalForm, setShowExternalForm] = useState(false);
  const [compType, setCompType] =
    useState<Exclude<MarkComponentType, "External">>("CT");
  const [label, setLabel] = useState("CT1");
  const [obtained, setObtained] = useState("");
  const [maxMarks, setMaxMarks] = useState("25");
  const [externalLabel, setExternalLabel] = useState("End Sem");
  const [externalObtained, setExternalObtained] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const completeGrade = detail.externalRecord ? detail.gradeResult : null;
  const internalScaled = detail.internalScaled;
  const externalMark = detail.gradeResult?.externalMark ?? 0;
  const totalMark = completeGrade?.totalMark ?? null;
  const rawInternalObtained = detail.internalRecords.reduce(
    (sum, mark) => sum + mark.marks_obtained,
    0
  );
  const rawInternalMax = detail.internalRecords.reduce(
    (sum, mark) => sum + mark.max_marks,
    0
  );

  const resetInternalForm = (type: Exclude<MarkComponentType, "External">) => {
    setCompType(type);
    setLabel(suggestLabel(type, detail.internalRecords));
    setMaxMarks(String(defaultMaxMarks(type)));
    setObtained("");
  };

  const handleComponentTypeChange = (
    nextType: Exclude<MarkComponentType, "External">
  ) => {
    setCompType(nextType);
    setLabel(suggestLabel(nextType, detail.internalRecords));
    setMaxMarks(String(defaultMaxMarks(nextType)));
  };

  const handleAddInternal = async () => {
    const obtainedValue = Number(obtained);
    const maxValue = Number(maxMarks);
    const newFieldErrors: Record<string, string> = {};
    if (!label.trim()) newFieldErrors.label = "Label is required";
    if (maxValue <= 0 || Number.isNaN(maxValue)) newFieldErrors.maxMarks = "Max marks must be > 0";
    if (Number.isNaN(obtainedValue) || obtainedValue < 0) newFieldErrors.obtained = "Must be ≥ 0";
    if (!newFieldErrors.obtained && !newFieldErrors.maxMarks && obtainedValue > maxValue) {
      newFieldErrors.obtained = "Cannot exceed max marks";
    }
    if (Object.keys(newFieldErrors).length > 0) {
      setFieldErrors(newFieldErrors);
      return;
    }
    setFieldErrors({});

    try {
      setFormError(null);
      await addMark.mutateAsync({
        subject_id: subject.id,
        component_type: compType,
        label: label.trim(),
        marks_obtained: Math.max(0, obtainedValue),
        max_marks: maxValue,
        is_external: false,
      });
      toast(`${label.trim()} added for ${subject.name}`);
      setShowInternalForm(false);
      resetInternalForm(compType);
    } catch (error) {
      setFormError(getMutationErrorMessage(error, "Could not save mark"));
    }
  };

  const handleAddExternal = async () => {
    const obtainedValue = Number(externalObtained);
    if (!externalLabel.trim() || Number.isNaN(obtainedValue)) return;

    try {
      setFormError(null);
      await addMark.mutateAsync({
        subject_id: subject.id,
        component_type: "External",
        label: externalLabel.trim(),
        marks_obtained: Math.max(0, Math.min(40, obtainedValue)),
        max_marks: 40,
        is_external: true,
      });
      toast(`${externalLabel.trim()} added for ${subject.name}`);
      setShowExternalForm(false);
      setExternalLabel("End Sem");
      setExternalObtained("");
    } catch (error) {
      setFormError(
        getMutationErrorMessage(error, "Could not save End Sem mark")
      );
    }
  };

  const collapsedTrigger = useMemo(
    () => (
      <div className="grid gap-3 py-1 sm:grid-cols-[1fr_auto_auto] sm:items-center">
        <div className="min-w-0">
          <p className="truncate font-syne font-semibold text-foreground">
            {subject.name}
          </p>
          <p className="font-mono text-xs text-muted-foreground">
            {subject.code}
          </p>
        </div>

        <div className="grid gap-2 sm:w-56">
          <MarksProgress
            obtained={internalScaled}
            max={60}
            color="#7c6af7"
            label="Internal (scaled)"
          />
          {detail.externalRecord ? (
            <MarksProgress
              obtained={externalMark}
              max={40}
              color="#22d3ee"
              label="External"
            />
          ) : (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">External</p>
              <div className="flex items-center gap-2">
                <div className="h-2 flex-1 rounded-full bg-[#1e1e2e]" />
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  -
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 sm:block sm:text-right">
          <GradeBadge grade={completeGrade?.grade ?? null} size="md" />
          <p className="font-mono text-xs text-muted-foreground sm:mt-1">
            {totalMark !== null ? `${totalMark.toFixed(1)} / 100` : "- / 100"}
          </p>
        </div>
      </div>
    ),
    [
      completeGrade?.grade,
      detail.externalRecord,
      externalMark,
      internalScaled,
      rawInternalMax,
      rawInternalObtained,
      subject.code,
      subject.name,
      totalMark,
    ]
  );

  return (
    <div
      className="rounded-lg border border-[#1e1e2e] bg-[#111118] transition-colors hover:bg-[#15151f]"
      style={{ borderLeftWidth: 4, borderLeftColor: subject.color_hex }}
    >
      <Collapsible
        open={open}
        onOpenChange={onOpenChange}
        className="p-4"
        trigger={collapsedTrigger}
      >
        <div className="space-y-6 border-t border-[#1e1e2e] pt-4">
          <section>
            <div className="mb-2 flex items-center justify-between gap-3">
              <h4 className="font-syne text-sm font-medium">
                Internal Components
              </h4>
              <div className="text-right font-mono text-xs">
                <p className="text-[#7c6af7]">
                  Scaled: {internalScaled.toFixed(1)} / 60
                </p>
                {rawInternalMax > 0 && (
                  <p className="text-muted-foreground">
                    Raw: {formatMarkValue(rawInternalObtained)} /{" "}
                    {formatMarkValue(rawInternalMax)}
                  </p>
                )}
              </div>
            </div>

            {detail.internalRecords.length === 0 ? (
              <p className="rounded-md border border-dashed border-[#1e1e2e] px-3 py-4 text-center text-sm text-muted-foreground">
                No internal marks added
              </p>
            ) : (
              <div className="space-y-2">
                {detail.internalRecords.map((mark) => (
                  <InternalMarkRow
                    key={mark.id}
                    mark={mark}
                    onDelete={() => {
                      deleteMark.mutate(mark.id, {
                        onSuccess: () => toast("Mark removed"),
                      });
                    }}
                    deleting={deleteMark.isPending}
                  />
                ))}
              </div>
            )}

            {!showInternalForm ? (
              <Button
                variant="outline"
                size="sm"
                className="mt-3 border-[#7c6af7]/40 text-[#c4b5fd] hover:bg-[#7c6af7]/10"
                onClick={() => {
                  resetInternalForm("CT");
                  setShowInternalForm(true);
                }}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Add Internal
              </Button>
            ) : (
              <InternalForm
                compType={compType}
                setCompType={handleComponentTypeChange}
                label={label}
                setLabel={setLabel}
                obtained={obtained}
                setObtained={setObtained}
                maxMarks={maxMarks}
                setMaxMarks={setMaxMarks}
                onSubmit={handleAddInternal}
                onCancel={() => {
                  setShowInternalForm(false);
                  setFieldErrors({});
                }}
                pending={addMark.isPending}
                fieldErrors={fieldErrors}
                setFieldErrors={setFieldErrors}
              />
            )}
            {formError && (
              <p className="mt-2 rounded-md border border-[#fb7185]/30 bg-[#fb7185]/10 px-3 py-2 text-xs text-[#fecdd3]">
                {formError}
              </p>
            )}
          </section>

          <section>
            <h4 className="mb-2 font-syne text-sm font-medium">
              External / End Sem
            </h4>
            {detail.externalRecord ? (
              <div className="rounded-md border border-[#1e1e2e] bg-[#0a0a0f] p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-syne text-sm text-foreground">
                      {detail.externalRecord.label}
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">
                      Added {formatAddedAt(detail.externalRecord.added_at)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      deleteMark.mutate(detail.externalRecord!.id, {
                        onSuccess: () => toast("Mark removed"),
                      })
                    }
                    disabled={deleteMark.isPending}
                    className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-[#1e1e2e] hover:text-[#fb7185]"
                    aria-label="Delete End Sem mark"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <MarksProgress
                  obtained={externalMark}
                  max={40}
                  color="#22d3ee"
                />
              </div>
            ) : !showExternalForm ? (
              <div className="rounded-md border border-dashed border-[#1e1e2e] p-4 text-center text-sm text-muted-foreground">
                <p>End Sem not added</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 border-[#7c6af7]/40 text-[#c4b5fd] hover:bg-[#7c6af7]/10"
                  onClick={() => setShowExternalForm(true)}
                >
                  <Plus className="mr-1.5 h-4 w-4" />
                  Add End Sem
                </Button>
              </div>
            ) : (
              <ExternalForm
                label={externalLabel}
                setLabel={setExternalLabel}
                obtained={externalObtained}
                setObtained={setExternalObtained}
                onSubmit={handleAddExternal}
                onCancel={() => setShowExternalForm(false)}
                pending={addMark.isPending}
              />
            )}
            {formError && !showInternalForm && (
              <p className="mt-2 rounded-md border border-[#fb7185]/30 bg-[#fb7185]/10 px-3 py-2 text-xs text-[#fecdd3]">
                {formError}
              </p>
            )}
          </section>

          <section className="rounded-md bg-[#0a0a0f] p-3">
            <h4 className="mb-3 font-syne text-sm font-medium">
              Grade Summary
            </h4>
            <div className="grid grid-cols-2 gap-3 font-mono text-xs sm:grid-cols-4">
              <SummaryCell
                label="Internal scaled"
                value={`${internalScaled.toFixed(1)} / 60`}
              />
              <SummaryCell
                label="Internal raw"
                value={
                  rawInternalMax > 0
                    ? `${formatMarkValue(rawInternalObtained)} / ${formatMarkValue(
                        rawInternalMax
                      )}`
                    : "-"
                }
              />
              <SummaryCell
                label="External"
                value={
                  detail.externalRecord ? `${externalMark.toFixed(1)} / 40` : "-"
                }
              />
              <SummaryCell
                label="Total"
                value={
                  totalMark !== null ? `${totalMark.toFixed(1)} / 100` : "-"
                }
              />
              <div>
                <p className="mb-1 text-muted-foreground">Grade</p>
                <GradeBadge grade={completeGrade?.grade ?? null} size="md" />
              </div>
            </div>
          </section>
        </div>
      </Collapsible>
    </div>
  );
}

function InternalMarkRow({
  mark,
  onDelete,
  deleting,
}: {
  mark: Mark;
  onDelete: () => void;
  deleting: boolean;
}) {
  return (
    <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-2 rounded-md bg-[#0a0a0f] px-3 py-2">
      <span
        className={cn(
          "rounded px-1.5 py-0.5 text-[10px] font-medium",
          COMPONENT_BADGE[mark.component_type]
        )}
      >
        {mark.component_type}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm text-foreground">{mark.label}</p>
        <p className="font-mono text-[10px] text-muted-foreground">
          {formatAddedAt(mark.added_at)}
        </p>
      </div>
      <span className="font-mono text-xs text-foreground">
        {mark.marks_obtained} / {mark.max_marks}
      </span>
      <button
        type="button"
        onClick={onDelete}
        disabled={deleting}
        className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-[#1e1e2e] hover:text-[#fb7185]"
        aria-label={`Delete ${mark.label}`}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function InternalForm({
  compType,
  setCompType,
  label,
  setLabel,
  obtained,
  setObtained,
  maxMarks,
  setMaxMarks,
  onSubmit,
  onCancel,
  pending,
  fieldErrors,
  setFieldErrors,
}: {
  compType: Exclude<MarkComponentType, "External">;
  setCompType: (t: Exclude<MarkComponentType, "External">) => void;
  label: string;
  setLabel: (value: string) => void;
  obtained: string;
  setObtained: (value: string) => void;
  maxMarks: string;
  setMaxMarks: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  pending: boolean;
  fieldErrors: Record<string, string>;
  setFieldErrors: (errors: Record<string, string>) => void;
}) {
  return (
    <div className="mt-3 space-y-3 rounded-md border border-[#1e1e2e] bg-[#0a0a0f] p-3">
      <div>
        <Label>Component Type</Label>
        <div className="mt-1 grid grid-cols-4 gap-1">
          {INTERNAL_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setCompType(type)}
              className={cn(
                "min-h-[36px] rounded-md border px-1 text-center text-[11px] font-medium transition-colors",
                compType === type
                  ? "border-[#7c6af7] bg-[#7c6af7]/20 text-[#c4b5fd]"
                  : "border-[#1e1e2e] bg-[#111118] text-muted-foreground"
              )}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label>Label</Label>
        <Input
          value={label}
          onChange={(e) => {
            setLabel(e.target.value);
            if (fieldErrors.label) setFieldErrors({ ...fieldErrors, label: "" });
          }}
        />
        {fieldErrors.label && (
          <p className="mt-1 text-xs text-[#fb7185]">{fieldErrors.label}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label>Marks Obtained</Label>
          <Input
            type="number"
            min={0}
            value={obtained}
            onChange={(e) => {
              setObtained(e.target.value);
              if (fieldErrors.obtained) setFieldErrors({ ...fieldErrors, obtained: "" });
            }}
          />
          {fieldErrors.obtained && (
            <p className="mt-1 text-xs text-[#fb7185]">{fieldErrors.obtained}</p>
          )}
        </div>
        <div>
          <Label>Max Marks</Label>
          <Input
            type="number"
            min={1}
            value={maxMarks}
            onChange={(e) => setMaxMarks(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button
          size="sm"
          className="bg-[#7c6af7] text-white hover:bg-[#6b5be0]"
          onClick={onSubmit}
          disabled={pending}
        >
          Add
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function ExternalForm({
  label,
  setLabel,
  obtained,
  setObtained,
  onSubmit,
  onCancel,
  pending,
}: {
  label: string;
  setLabel: (value: string) => void;
  obtained: string;
  setObtained: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  pending: boolean;
}) {
  return (
    <div className="space-y-3 rounded-md border border-[#1e1e2e] bg-[#0a0a0f] p-3">
      <div>
        <Label>Label</Label>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label>Marks Obtained</Label>
          <Input
            type="number"
            min={0}
            max={40}
            value={obtained}
            onChange={(e) => setObtained(e.target.value)}
          />
        </div>
        <div>
          <Label>Max Marks</Label>
          <Input value={40} readOnly className="opacity-60" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button
          size="sm"
          className="bg-[#7c6af7] text-white hover:bg-[#6b5be0]"
          onClick={onSubmit}
          disabled={pending}
        >
          Add
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="mt-1 text-foreground">{value}</p>
    </div>
  );
}
