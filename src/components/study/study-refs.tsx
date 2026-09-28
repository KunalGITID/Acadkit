import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen } from "lucide-react";
import { usePin } from "@/hooks/useData";
import { Link } from "react-router-dom";
import { fetchStudyManifest } from "@/api/studyFiles";
import { viewerHref } from "@/lib/viewer";
import { usePrefetchFile } from "@/hooks/usePrefetchFile";
import { useViewerLinkState } from "@/hooks/useViewerLink";
import { baseName, extOf, prettyName } from "@/lib/studyFiles";
import { cn } from "@/lib/utils";

export interface StudyRef {
  path: string;
  page?: number | null;
}

/**
 * Links to passages in the study folder - "Unit_3 slides · p. 12" - that
 * open the file at that page. Refs whose file has left the folder since
 * are dropped rather than shown dead.
 */
export function StudyRefs({ refs, className }: { refs: StudyRef[]; className?: string }) {
  const pin = usePin();
  const prefetch = usePrefetchFile();
  const viewerState = useViewerLinkState();
  const manifest = useQuery({
    queryKey: ["study-files", pin],
    queryFn: () => fetchStudyManifest(pin),
    staleTime: 5 * 60_000,
  });
  const files = useMemo(() => {
    const byPath = new Map((manifest.data?.files ?? []).map((f) => [f.path, f]));
    return refs.flatMap((r) => {
      const f = byPath.get(r.path);
      return f ? [{ ref: r, file: f }] : [];
    });
  }, [manifest.data, refs]);
  if (files.length === 0) return null;
  return (
    <ul className={cn("space-y-1", className)}>
      {files.map(({ ref, file }) => {
        const at = viewerHref(file.path, ref.page && extOf(file.path) === "pdf" ? ref.page : null);
        const label = (
          <>
            <BookOpen className="h-3.5 w-3.5 shrink-0 text-accent" />
            <span className="min-w-0 truncate">{prettyName(baseName(file.path).replace(/\.[^.]+$/, ""))}</span>
            {ref.page ? <span className="shrink-0 text-muted">· p. {ref.page}</span> : null}
          </>
        );
        return (
          <li key={ref.path}>
            <Link to={at} state={viewerState} {...prefetch(file)} className="flex items-center gap-1.5 text-xs font-semibold text-ink hover:text-accent">
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
