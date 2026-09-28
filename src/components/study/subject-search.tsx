import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Search, Sparkles, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { FileRow, SearchHitRow } from "@/components/study/file-row";
import { usePin } from "@/hooks/useData";
import { useStudyDeletions } from "@/hooks/useStudyDeletions";
import { searchStudyFiles } from "@/api/studyFiles";
import { groupHits, searchFiles, type StudyFile } from "@/lib/studyFiles";

const MIN_DEEP = 3;

/** Search one subject's files: typing matches their names at once, Enter searches inside them by meaning - the Study page's search, confined to this subject. */
export function SubjectSearch({ files, name }: { files: StudyFile[]; name: string }) {
  const pin = usePin();
  const { pendingByPath, available: canDelete, askDelete, undo } = useStudyDeletions();
  const [query, setQuery] = useState("");
  const [deep, setDeep] = useState<string | null>(null);
  const trimmed = query.trim();
  const searching = trimmed.length > 0;
  const deepActive = deep !== null && deep === trimmed;

  const byName = useMemo(() => (searching ? searchFiles(files, trimmed, 20) : []), [files, trimmed, searching]);
  const hits = useQuery({
    queryKey: ["study-search", pin, deep],
    queryFn: () => searchStudyFiles(pin, deep!),
    enabled: deepActive,
    staleTime: 10 * 60_000,
    retry: 0,
  });
  const keys = useMemo(() => new Set(files.map((f) => f.key)), [files]);
  const grouped = useMemo(
    () => (deepActive && hits.data ? groupHits(hits.data.filter((h) => keys.has(h.file_key)), files) : []),
    [deepActive, hits.data, files, keys]
  );

  return (
    <section className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <Input
          type="text"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && trimmed.length >= MIN_DEEP) setDeep(trimmed);
          }}
          placeholder="Search this subject's files"
          className="pl-11 pr-11"
          aria-label={`Search ${name}'s files`}
        />
        {searching && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setDeep(null);
            }}
            className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-xl text-muted hover:text-ink"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {searching && trimmed.length >= MIN_DEEP && !deepActive && (
        <button
          type="button"
          onClick={() => setDeep(trimmed)}
          className="card flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold transition-colors hover:bg-surface-2/60"
        >
          <Sparkles className="h-4 w-4 shrink-0 text-accent" />
          <span className="min-w-0 flex-1 truncate">Search inside {name}'s files for “{trimmed}”</span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
        </button>
      )}

      {deepActive && (
        <section className="card divide-y overflow-hidden p-0">
          <p className="flex items-center gap-1.5 px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest text-muted">
            <Sparkles className="h-3 w-3" /> Inside these files
          </p>
          {hits.isLoading && <p className="px-4 py-6 text-center text-sm font-medium text-muted">Searching…</p>}
          {hits.isError && (
            <p className="px-4 py-6 text-center text-sm font-medium text-muted">Couldn't search inside right now. Try again.</p>
          )}
          {hits.data && grouped.length === 0 && (
            <p className="px-4 py-6 text-center text-sm font-medium text-muted">Nothing inside {name}'s files matches that.</p>
          )}
          {grouped.map((g) => (
            <SearchHitRow key={g.file.key} file={g.file} hits={g.hits} query={deep!} />
          ))}
        </section>
      )}

      {searching && !deepActive && (
        <section className="card divide-y overflow-hidden p-0">
          {byName.map((f) => (
            <FileRow
              key={f.path}
              file={f}
              showFolder
              deleting={pendingByPath.has(f.path)}
              onDelete={canDelete ? () => askDelete(f) : undefined}
              onUndo={() => undo(f.path)}
              swipeToDelete
            />
          ))}
          {byName.length === 0 && (
            <p className="px-4 py-6 text-center text-sm font-medium text-muted">
              No file names match “{trimmed}”.{trimmed.length >= MIN_DEEP && " Press Enter to search inside them."}
            </p>
          )}
        </section>
      )}
    </section>
  );
}
