import { Check } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { useAddSubject } from "@/hooks/useSubjects";
import { SUBJECT_COLORS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/useAppStore";

interface SubjectSheetProps {
  open: boolean;
  onClose: () => void;
}

export function SubjectSheet({ open, onClose }: SubjectSheetProps) {
  const { toast } = useToast();
  const addSubject = useAddSubject();
  const existingSubjects = useAppStore((s) => s.subjects);

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [credits, setCredits] = useState(3);
  const [type, setType] = useState<"theory" | "lab">("theory");
  const [faculty, setFaculty] = useState("");
  const [colorHex, setColorHex] = useState(SUBJECT_COLORS[0]);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const reset = () => {
    setName("");
    setCode("");
    setCredits(3);
    setType("theory");
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
    } else if (existingSubjects.some((s) => s.name.toLowerCase() === trimmedName.toLowerCase())) {
      newErrors.name = "A subject with this name already exists";
    }
    if (!trimmedCode || trimmedCode.length < 3) {
      newErrors.code = "Code must be at least 3 characters";
    } else if (existingSubjects.some((s) => s.code === trimmedCode)) {
      newErrors.code = "A subject with this code already exists";
    }
    if (credits < 1 || credits > 5) {
      newErrors.credits = "Credits must be between 1 and 5";
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      await addSubject.mutateAsync({
        name: name.trim(),
        code: code.trim().toUpperCase(),
        credits,
        type,
        faculty: faculty.trim() || undefined,
        color_hex: colorHex,
      });
      toast(`${name.trim()} added`);
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
    <Sheet open={open} onClose={handleClose} title="Add Subject">
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
            min={1}
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
          <Label>Type</Label>
          <div className="flex gap-2">
            {(["theory", "lab"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={cn(
                  "flex-1 rounded-md border py-2 text-sm capitalize transition-colors",
                  type === t
                    ? "border-[#7c6af7] bg-[#7c6af7]/20 text-[#7c6af7]"
                    : "border-[#1e1e2e] bg-[#0a0a0f] text-muted-foreground"
                )}
              >
                {t}
              </button>
            ))}
          </div>
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
          {addSubject.isPending ? "Adding…" : "Add Subject"}
        </Button>
      </form>
    </Sheet>
  );
}
