import { Check } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { useAddSubject, useUpdateSubject } from "@/hooks/useSubjects";
import type { Subject } from "@/types/database";
import { SUBJECT_COLORS } from "@/lib/constants";
import { useAppStore } from "@/store/useAppStore";

interface SubjectSheetProps {
  open: boolean;
  onClose: () => void;
  editSubject?: Subject;
}

export function SubjectSheet({ open, onClose, editSubject }: SubjectSheetProps) {
  const { toast } = useToast();
  const addSubject = useAddSubject();
  const updateSubject = useUpdateSubject();
  const existingSubjects = useAppStore((s) => s.subjects);
  const isEditing = !!editSubject;

  const [name, setName] = useState(editSubject?.name ?? "");
  const [code, setCode] = useState(editSubject?.code ?? "");
  const [credits, setCredits] = useState(editSubject?.credits ?? 3);
  const [faculty, setFaculty] = useState(editSubject?.faculty ?? "");
  const [colorHex, setColorHex] = useState(editSubject?.color_hex ?? SUBJECT_COLORS[0]);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setName(editSubject?.name ?? "");
      setCode(editSubject?.code ?? "");
      setCredits(editSubject?.credits ?? 3);
      setFaculty(editSubject?.faculty ?? "");
      setColorHex(editSubject?.color_hex ?? SUBJECT_COLORS[0]);
      setError(null);
      setErrors({});
    }
  }, [open, editSubject]);

  const reset = () => {
    setName("");
    setCode("");
    setCredits(3);
    setFaculty("");
    setColorHex(SUBJECT_COLORS[0]);
    setError(null);
    setErrors({});
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};
    const trimmedName = name.trim();
    const trimmedCode = code.trim().toUpperCase();
    if (!trimmedName || trimmedName.length < 2) {
      newErrors.name = "Name must be at least 2 characters";
    } else if (existingSubjects.some((s) => s.name.toLowerCase() === trimmedName.toLowerCase() && s.id !== editSubject?.id)) {
      newErrors.name = "A subject with this name already exists";
    }
    if (!trimmedCode || trimmedCode.length < 3) {
      newErrors.code = "Code must be at least 3 characters";
    } else if (existingSubjects.some((s) => s.code === trimmedCode && s.id !== editSubject?.id)) {
      newErrors.code = "A subject with this code already exists";
    }
    if (credits < 0 || credits > 5) {
      newErrors.credits = "Credits must be between 0 and 5";
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      if (isEditing && editSubject) {
        await updateSubject.mutateAsync({
          id: editSubject.id,
          name: name.trim(),
          code: code.trim().toUpperCase(),
          credits,
          faculty: faculty.trim() || undefined,
          color_hex: colorHex,
        });
        toast(`${name.trim()} updated`);
      } else {
        await addSubject.mutateAsync({
          name: name.trim(),
          code: code.trim().toUpperCase(),
          credits,
          type: "theory",
          faculty: faculty.trim() || undefined,
          color_hex: colorHex,
        });
        toast(`${name.trim()} added`);
      }
      handleClose();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "object" &&
              err !== null &&
              "message" in err &&
              typeof (err as { message: unknown }).message === "string"
            ? (err as { message: string }).message
            : "Failed to add subject. Try again.";
      setError(message);
    }
  };

  return (
    <Sheet open={open} onClose={handleClose} title={isEditing ? "Edit Subject" : "Add Subject"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="subject-name">Subject Name</Label>
          <Input
            id="subject-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (errors.name) setErrors((prev) => ({ ...prev, name: "" }));
            }}
            placeholder="Data Structures"
            required
          />
          {errors.name && (
            <p className="text-xs text-[#fb7185]">{errors.name}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="subject-code">Subject Code</Label>
          <Input
            id="subject-code"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              if (errors.code) setErrors((prev) => ({ ...prev, code: "" }));
            }}
            placeholder="BCSE301L"
            className="font-mono"
            required
          />
          {errors.code && (
            <p className="text-xs text-[#fb7185]">{errors.code}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="credits">Credits</Label>
          <Input
            id="credits"
            type="number"
            min={0}
            max={5}
            value={credits}
            onChange={(e) => {
              setCredits(Number(e.target.value));
              if (errors.credits) setErrors((prev) => ({ ...prev, credits: "" }));
            }}
            required
          />
          {errors.credits && (
            <p className="text-xs text-[#fb7185]">{errors.credits}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="faculty">Faculty Name (optional)</Label>
          <Input
            id="faculty"
            value={faculty}
            onChange={(e) => setFaculty(e.target.value)}
            placeholder="Dr. Smith"
          />
        </div>

        <div className="space-y-2">
          <Label>Color</Label>
          <div className="flex flex-wrap gap-3">
            {SUBJECT_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setColorHex(color)}
                className="relative h-9 w-9 rounded-full border-2 border-transparent"
                style={{ backgroundColor: color }}
                aria-label={`Select color ${color}`}
              >
                {colorHex === color && (
                  <Check className="absolute inset-0 m-auto h-4 w-4 text-white drop-shadow" />
                )}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <Button
          type="submit"
          className="w-full bg-[#7c6af7] hover:bg-[#7c6af7]/90"
          disabled={addSubject.isPending}
        >
          {(addSubject.isPending || updateSubject.isPending) ? (isEditing ? "Saving…" : "Adding…") : (isEditing ? "Save Changes" : "Add Subject")}
        </Button>
      </form>
    </Sheet>
  );
}
