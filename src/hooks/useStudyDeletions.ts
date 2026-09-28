import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useDialog } from "@/components/ui/dialog";
import { usePin } from "@/hooks/useData";
import { cancelStudyDeletion, fetchStudyDeletions, requestStudyDeletion, requestStudyDeletions } from "@/api/studyFiles";
import { baseName, prettyName, type StudyFile } from "@/lib/studyFiles";

/** Deleting a study file (migration 032): the app asks, the Mac moves it to its Trash at the next sync, and the manifest stops listing it. */
export function useStudyDeletions() {
  const pin = usePin();
  const qc = useQueryClient();
  const { confirm } = useDialog();
  const deletions = useQuery({
    queryKey: ["study-deletions", pin],
    queryFn: () => fetchStudyDeletions(pin),
    // While any are waiting, look again every minute, and pick up the new manifest too.
    refetchInterval: (q) => (q.state.data?.some((d) => d.status === "pending") ? 60_000 : false),
    retry: 1,
  });
  const pendingByPath = useMemo(
    () => new Map((deletions.data ?? []).filter((d) => d.status === "pending").map((d) => [d.path, d.id])),
    [deletions.data]
  );
  const refresh = () => qc.invalidateQueries({ queryKey: ["study-deletions", pin] });
  const request = useMutation({
    mutationFn: (f: StudyFile) => requestStudyDeletion(pin, f),
    onSuccess: refresh,
    onError: () => toast.error("Couldn't delete that. Check your connection and try again."),
  });
  const requestMany = useMutation({
    mutationFn: (fs: StudyFile[]) => requestStudyDeletions(pin, fs, new Set(pendingByPath.keys())),
    onSuccess: refresh,
    onError: () => toast.error("Couldn't delete that folder. Check your connection and try again."),
  });
  const undo = useMutation({
    mutationFn: (id: string) => cancelStudyDeletion(id),
    onSuccess: refresh,
    onError: () => toast.error("Couldn't undo. The Mac may already have moved it to the Trash."),
  });

  async function askDelete(f: StudyFile) {
    const ok = await confirm({
      title: `Delete ${baseName(f.path)}?`,
      body: "Your Mac moves it to the Trash at its next sync (usually within a few minutes), and then it's gone from every device. You can undo until then, and restore it from the Mac's Trash after.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (ok) request.mutate(f);
  }

  /** A whole folder: every file under `folder` (a path like "Operating_Systems/07_PYQs"). */
  async function askDeleteFolder(folder: string, files: StudyFile[]) {
    const inside = files.filter((f) => f.path.startsWith(`${folder}/`));
    if (inside.length === 0) return;
    const ok = await confirm({
      title: `Delete ${prettyName(folder.split("/").pop()!)}?`,
      body: `All ${inside.length} file${inside.length === 1 ? "" : "s"} in it go to your Mac's Trash at its next sync, and the folder goes with them. You can undo until then, and restore them from the Mac's Trash after.`,
      confirmLabel: `Delete ${inside.length} file${inside.length === 1 ? "" : "s"}`,
      destructive: true,
    });
    if (ok) requestMany.mutate(inside);
  }

  return {
    deletions,
    pendingByPath,
    /** Off when the deletions table can't be read (migration 032 not run). */
    available: !deletions.isError,
    askDelete,
    askDeleteFolder,
    undo: (path: string) => {
      const id = pendingByPath.get(path);
      if (id) undo.mutate(id);
    },
    /** Take back every open request under a folder. */
    undoFolder: (folder: string) => {
      for (const [p, id] of pendingByPath) if (p.startsWith(`${folder}/`)) undo.mutate(id);
    },
  };
}
