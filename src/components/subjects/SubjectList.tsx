import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { useDeleteSubject } from "@/hooks/useSubjects";
import { useAppStore } from "@/store/useAppStore";
import type { Subject } from "@/types/database";
import { SubjectSheet } from "./SubjectSheet";

export function SubjectList() {
  const subjects = useAppStore((s) => s.subjects);
  const deleteSubject = useDeleteSubject();
  const { toast } = useToast();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [editSubject, setEditSubject] = useState<Subject | null>(null);

  const subjectToDelete = subjects.find((s) => s.id === confirmId);

  const handleDelete = async () => {
    if (!confirmId || !subjectToDelete) return;
    try {
      await deleteSubject.mutateAsync(confirmId);
      toast(`${subjectToDelete.name} removed`);
      setConfirmId(null);
    } catch {
      toast("Failed to remove subject");
    }
  };

  if (subjects.length === 0) return null;

  return (
    <>
      <div className="space-y-3">
        {subjects.map((subject) => (
          <div
            key={subject.id}
            className="flex items-start gap-3 rounded-lg border border-[#1e1e2e] bg-[#111118] p-4 transition-colors hover:bg-[#1a1a2e]"
            style={{ borderLeftWidth: 4, borderLeftColor: subject.color_hex }}
          >
            <div className="min-w-0 flex-1">
              <p className="font-syne font-semibold text-foreground">
                {subject.name}
              </p>
              <p className="font-mono text-xs text-muted-foreground">
                {subject.code}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="rounded-full bg-[#1e1e2e] px-2 py-0.5 text-xs text-muted-foreground">
                  {subject.credits} cr
                </span>
              </div>
              {subject.faculty && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {subject.faculty}
                </p>
              )}
            </div>
            <div className="flex shrink-0 gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-[#7c6af7]"
                onClick={() => setEditSubject(subject)}
                aria-label={`Edit ${subject.name}`}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-red-400"
                onClick={() => setConfirmId(subject.id)}
                aria-label={`Delete ${subject.name}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <SubjectSheet
        open={!!editSubject}
        onClose={() => setEditSubject(null)}
        editSubject={editSubject ?? undefined}
      />

      <Dialog open={!!confirmId} onOpenChange={() => setConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove subject?</DialogTitle>
            <DialogDescription>
              Remove {subjectToDelete?.name}? All timetable slots for this
              subject will also be deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => setConfirmId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteSubject.isPending}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
