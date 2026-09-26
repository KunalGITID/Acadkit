import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Folder, FolderSync, Search, Sparkles, X } from "lucide-react";
import { FileRow, SearchHitRow } from "@/components/study/file-row";
import { Input } from "@/components/ui/input";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { usePin } from "@/hooks/useData";
import { fetchStudyManifest, searchStudyFiles, signStudyFiles } from "@/api/studyFiles";
import { formatSize, groupHits, listFolder, prettyName, searchFiles } from "@/lib/studyFiles";

/** A query this short matches everything and nothing by meaning. */
const MIN_DEEP = 3;

/** What to say when a search inside files fails, by why it failed. */
function deepError(err: unknown): string {
  const status = (err as { context?: { status?: number } } | null)?.context?.status;
  if (status === 404) return "Search inside files isn't set up yet — on your Mac, run npm run sync:files to build the index.";
  return "Couldn't search inside your files. Check your connection and try again.";
}

function synced(at: number): string {
  return new Date(at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export default function Files() {
  const pin = usePin();
  const [dir, setDir] = useState("");
  const [query, setQuery] = useState("");
  // The query last sent for a search inside files; results show while the box still says it.
  const [deep, setDeep] = useState<string | null>(null);

  const manifest = useQuery({
    queryKey: ["study-files", pin],
    queryFn: () => fetchStudyManifest(pin),
    staleTime: 5 * 60_000,
  });
  const files = useMemo(() => manifest.data?.files ?? [], [manifest.data]);

  const trimmed = query.trim();
  const searching = trimmed.length > 0;
  const deepActive = deep !== null && deep === trimmed;
  const view = useMemo(() => listFolder(files, dir), [files, dir]);
  const results = useMemo(() => (searching ? searchFiles(files, query) : []), [files, query, searching]);
  const shown = searching ? results : view.files;

  // Search by meaning (study-search, migration 030): sent on Enter, not per keystroke.
  const hits = useQuery({
    queryKey: ["study-search", pin, deep],
    queryFn: () => searchStudyFiles(pin, deep!),
    enabled: deepActive,
    staleTime: 10 * 60_000,
    retry: 0,
  });
  const grouped = useMemo(
    () => (deepActive && hits.data ? groupHits(hits.data, files) : []),
    [deepActive, hits.data, files]
  );
  const hitLinks = useQuery({
    queryKey: ["study-links", pin, grouped.map((g) => g.file.key).join("|")],
    queryFn: () => signStudyFiles(grouped.map((g) => g.file)),
    enabled: grouped.length > 0,
    staleTime: 30 * 60_000,
    gcTime: 30 * 60_000,
  });

  // Links are signed an hour at a time; refresh well before they lapse.
  const links = useQuery({
    queryKey: ["study-links", pin, shown.map((f) => f.key).join("|")],
    queryFn: () => signStudyFiles(shown),
    enabled: shown.length > 0,
    staleTime: 30 * 60_000,
    gcTime: 30 * 60_000,
  });

  if (manifest.isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-9 w-44" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!manifest.data) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="px-1 text-2xl font-extrabold tracking-tight lg:text-3xl">Study</h1>
        <section className="card">
          <EmptyState
            icon={FolderSync}
            title={manifest.isError ? "Couldn't load your files" : "No files synced yet"}
            description={
              manifest.isError
                ? "Check your connection and open this page again."
                : "On your Mac, run npm run sync:files in the AcadKit folder. Your study folder appears here on every device."
            }
            className="py-10"
          />
        </section>
      </div>
    );
  }

  const crumbs = dir ? dir.split("/") : [];
  const totalSize = files.reduce((s, f) => s + f.size, 0);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="px-1">
        <h1 className="text-2xl font-extrabold tracking-tight lg:text-3xl">Study</h1>
        <p className="mt-1 text-sm font-medium text-muted">
          {manifest.data.root} · {files.length} files · {formatSize(totalSize)} · synced {synced(manifest.data.syncedAt)}
        </p>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <Input
          id="files-search"
          // Not type="search": Safari and Chrome add their own clear button
          // to it, which sat next to this one as a second ✕.
          type="text"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && trimmed.length >= MIN_DEEP) setDeep(trimmed);
          }}
          placeholder="Search, e.g. os unit 1 — Enter searches inside"
          className="pl-11 pr-11"
          aria-label="Search files"
        />
        {searching && (
          <button
            type="button"
            onClick={() => setQuery("")}
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
          <span className="min-w-0 flex-1 truncate">Search inside files for “{trimmed}”</span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
        </button>
      )}

      {deepActive && (
        <section className="card divide-y overflow-hidden p-0">
          <p className="flex items-center gap-1.5 px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest text-muted">
            <Sparkles className="h-3 w-3" /> Inside your files
          </p>
          {hits.isLoading && <p className="px-4 py-6 text-center text-sm font-medium text-muted">Searching…</p>}
          {hits.isError && <p className="px-4 py-6 text-center text-sm font-medium text-muted">{deepError(hits.error)}</p>}
          {hits.data && grouped.length === 0 && (
            <p className="px-4 py-6 text-center text-sm font-medium text-muted">Nothing inside your files matches that.</p>
          )}
          {grouped.map((g) => (
            <SearchHitRow key={g.file.key} file={g.file} hits={g.hits} query={deep!} href={hitLinks.data?.[g.file.key]} />
          ))}
        </section>
      )}

      {!searching && crumbs.length > 0 && (
        <nav className="flex flex-wrap items-center gap-1 px-1 text-sm font-semibold" aria-label="Folder path">
          <button
            type="button"
            onClick={() => setDir(crumbs.slice(0, -1).join("/"))}
            className="mr-1 flex h-8 w-8 items-center justify-center rounded-xl bg-surface-2 text-ink"
            aria-label="Up one folder"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setDir("")} className="text-muted hover:text-ink">
            {manifest.data.root}
          </button>
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1">
              <ChevronRight className="h-3.5 w-3.5 text-muted" />
              <button
                type="button"
                onClick={() => setDir(crumbs.slice(0, i + 1).join("/"))}
                className={i === crumbs.length - 1 ? "text-ink" : "text-muted hover:text-ink"}
              >
                {prettyName(c)}
              </button>
            </span>
          ))}
        </nav>
      )}

      <section className="card divide-y overflow-hidden p-0">
        {!searching &&
          view.folders.map((folder) => (
            <button
              key={folder.path}
              type="button"
              onClick={() => setDir(folder.path)}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-2/60"
            >
              <Folder className="h-5 w-5 shrink-0 text-accent" strokeWidth={1.8} />
              <span className="min-w-0 flex-1 truncate text-sm font-bold">{prettyName(folder.name)}</span>
              <span className="shrink-0 text-xs font-semibold text-muted tabular">{folder.count}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
            </button>
          ))}

        {shown.map((f) => (
          <FileRow key={f.path} file={f} href={links.data?.[f.key]} showFolder={searching} />
        ))}

        {searching && results.length === 0 && (
          <p className="px-4 py-8 text-center text-sm font-medium text-muted">No file names match “{query.trim()}”.</p>
        )}
        {!searching && view.folders.length === 0 && view.files.length === 0 && (
          <p className="px-4 py-8 text-center text-sm font-medium text-muted">This folder is empty.</p>
        )}
      </section>

      {links.isError && (
        <p className="px-1 text-sm font-medium text-bad-deep">Couldn't prepare the links. Check your connection and try again.</p>
      )}
    </div>
  );
}
