import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePin } from "@/hooks/useData";
import { prefetchStudyFile } from "@/components/viewer/loaders";
import type { StudyFile } from "@/lib/studyFiles";

/** Props for a link that opens a file: start opening it the moment a finger lands (pointerdown), a pointer rests on it, or it gets keyboard focus - so by the time the viewer mounts, the bytes are on their way or already here. */
export function usePrefetchFile() {
  const qc = useQueryClient();
  const pin = usePin();
  return useCallback(
    (file: StudyFile) => {
      const go = () => prefetchStudyFile(qc, pin, file);
      return { onPointerDown: go, onMouseEnter: go, onFocus: go };
    },
    [qc, pin]
  );
}
