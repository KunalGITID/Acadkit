import { useEffect, useMemo, useRef, useState } from "react";
import { warmViewer } from "@/components/viewer/loaders";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { BookOpen, ChevronDown, ChevronLeft, ChevronRight, Clock, CloudOff, Folder, FolderSync, Info, Search, Sparkles, Undo2, Upload, X } from "lucide-react";
import { FileRow, SearchHitRow, SwipeToDelete } from "@/components/study/file-row";
import { Input } from "@/components/ui/input";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { usePin } from "@/hooks/useData";
import {
  cancelStudyUpload,
  fetchCurriculum,
  fetchMacHeartbeat,
  fetchPendingUploads,
  fetchStudyManifest,
  MAX_UPLOAD_BYTES,
  uploadStudyFile,
  searchStudyFiles,
} from "@/api/studyFiles";
import { fetchUnits } from "@/api/units";
import { cn } from "@/lib/utils";
import { useStudyDeletions } from "@/hooks/useStudyDeletions";
import { courseNames, titleCase } from "@/lib/curriculum";
import { baseName, formatSize, groupHits, listFolder, prettyName, isReferenceFolder, isSyllabusFile, RECENT_DAYS, recentFiles, searchFiles, type StudyFile } from "@/lib/studyFiles";

/** A course code in a folder name: "OS_21CSC202J" → 21CSC202J. */
const COURSE_CODE = /(?<![A-Za-z0-9])(\d{2}[A-Z]{3}\d{3}[A-Z])(?![A-Za-z0-9])/;

/**
 * A syllabus filed away from its subject (Syllabi/, next semester's
 * courses) gets a button to that course's page. Inside the subject's own
 * folder the overview link already covers it.
 */
function courseLinkFor(f: StudyFile, folderSubject: string | null): string | null {
  if (!isSyllabusFile(f) || !f.subject_code) return null;
  return f.subject_code === folderSubject ? null : f.subject_code;
}

/** The overview link on a subject folder: see the call. */
function subjectOfFolder(top: string, files: StudyFile[]): string | null {
  const named = COURSE_CODE.exec(top)?.[1];
  if (named) return named;
  const codes = new Set(files.filter((f) => f.path.startsWith(`${top}/`) && f.subject_code).map((f) => f.subject_code!));
  return codes.size === 1 ? [...codes][0] : null;
}

/** A query this short matches everything and nothing by meaning. */
const MIN_DEEP = 3;

/** What to say when a search inside files fails, by why it failed. */
function deepError(err: unknown): string {
  const status = (err as { context?: { status?: number } } | null)?.context?.status;
  if (status === 404) return "Search inside files isn't set up yet - on your Mac, run npm run sync:files to build the index.";
  return "Couldn't search inside your files. Check your connection and try again.";
}

function synced(at: number): string {
  return new Date(at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export default function Files() {
  // Load the viewer while you browse, so the first file opens without waiting on it.
  useEffect(() => warmViewer(), []);
  const pin = usePin();
  // The folder you're in lives in the URL (?dir=…), so a subject page can link
  // straight to its folder and the back button steps back out of folders.
  const [params, setParams] = useSearchParams();
  const dir = params.get("dir") ?? "";
  const setDir = (d: string) => setParams(d ? { dir: d } : {});
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  // The query last sent for a search inside files; results show while the box still says it.
  const [deep, setDeep] = useState<string | null>(null);

  const manifest = useQuery({
    queryKey: ["study-files", pin],
    queryFn: () => fetchStudyManifest(pin),
    staleTime: 5 * 60_000,
  });
  const files = useMemo(() => manifest.data?.files ?? [], [manifest.data]);

  // Deleting (migration 032): shared with a subject's overview.
  const qc = useQueryClient();
  const { deletions, pendingByPath, available: canDelete, askDelete, askDeleteFolder, undo: undoDelete, undoFolder } = useStudyDeletions();
  const kept = useMemo(
    () => (deletions.data ?? []).filter((d) => d.status === "skipped" && files.some((f) => f.path === d.path)),
    [deletions.data, files]
  );
  // Uploads from here (migration 033): saved into the folder on the Mac, then synced back.
  const uploads = useQuery({
    queryKey: ["study-uploads", pin],
    queryFn: () => fetchPendingUploads(pin),
    refetchInterval: (q) => ((q.state.data?.length ?? 0) > 0 ? 60_000 : false),
    retry: 1,
  });
  const heartbeat = useQuery({
    queryKey: ["study-heartbeat", pin],
    queryFn: () => fetchMacHeartbeat(pin),
    staleTime: 10 * 60_000,
    retry: 1,
  });
  const [now] = useState(() => Date.now());
  const macQuiet = heartbeat.data != null && now - heartbeat.data > 24 * 60 * 60_000;
  const fileInput = useRef<HTMLInputElement>(null);

  const pendingCount = pendingByPath.size + (uploads.data?.length ?? 0);
  const prevPending = useRef(pendingCount);
  useEffect(() => {
    // Some went through on the Mac: the file list has changed.
    if (pendingCount < prevPending.current) qc.invalidateQueries({ queryKey: ["study-files", pin] });
    prevPending.current = pendingCount;
  }, [pendingCount, pin, qc]);

  const refreshUploads = () => qc.invalidateQueries({ queryKey: ["study-uploads", pin] });
  const sendFiles = useMutation({
    mutationFn: async ({ list, folder }: { list: File[]; folder: string }) => {
      for (const f of list) await uploadStudyFile(pin, folder, f);
      return list.length;
    },
    onSuccess: (n) => {
      toast.success(`${n === 1 ? "File" : `${n} files`} sent. Your Mac saves ${n === 1 ? "it" : "them"} at its next sync.`);
      refreshUploads();
    },
    onError: (err) => {
      toast.error((err as Error)?.message ?? "Couldn't upload. Check your connection and try again.");
      refreshUploads();
    },
  });
  const cancelUpload = useMutation({
    mutationFn: cancelStudyUpload,
    onSuccess: refreshUploads,
    onError: () => toast.error("Couldn't cancel. The Mac may already have saved it."),
  });
  function pickFiles(list: FileList | null) {
    const chosen = Array.from(list ?? []);
    if (chosen.length === 0) return;
    const big = chosen.filter((f) => f.size > MAX_UPLOAD_BYTES);
    if (big.length) toast.error(`${big.map((f) => f.name).join(", ")}: over the 50 MB limit, skipped.`);
    const ok = chosen.filter((f) => f.size <= MAX_UPLOAD_BYTES);
    if (ok.length) sendFiles.mutate({ list: ok, folder: dir });
  }

  const trimmed = query.trim();
  const searching = trimmed.length > 0;
  const deepActive = deep !== null && deep === trimmed;
  const view = useMemo(() => listFolder(files, dir), [files, dir]);
  const results = useMemo(() => (searching ? searchFiles(files, query) : []), [files, query, searching]);
  const shown = searching ? results : view.files;
  // Proper course names, so a syllabus shows as its course rather than
  // as "21CSE429T_Data_Science_for_IoT.pdf".
  const curriculum = useQuery({ queryKey: ["curriculum", pin], queryFn: () => fetchCurriculum(pin), staleTime: 60 * 60_000 });
  const unitsData = useQuery({ queryKey: ["units", pin], queryFn: () => fetchUnits(pin), staleTime: 5 * 60_000 });
  const names = useMemo(() => courseNames(curriculum.data, unitsData.data?.courses), [curriculum.data, unitsData.data]);
  const syllabusLabel = (f: StudyFile) => {
    if (!isSyllabusFile(f) || !f.subject_code) return {};
    // A course nobody lists still reads better without its code and
    // underscores: "21CSE373T_Streaming_Analytics.pdf" → "Streaming Analytics".
    const fromFile = baseName(f.path)
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(new RegExp(f.subject_code, "i"), "")
      .replace(/[_-]+/g, " ")
      .replace(/\bsyllabus\b/i, "")
      .trim();
    const name = names.get(f.subject_code) ?? (fromFile ? titleCase(fromFile) : null);
    return name ? { title: name, note: `Syllabus · ${f.subject_code}` } : {};
  };
  // New and updated on the Mac in the last fortnight, at the top level only:
  // what the weekly scan and your uploads have just brought in.
  const [recentOpen, setRecentOpen] = useState(false);
  const recent = useMemo(() => (!dir && !searching ? recentFiles(files, Date.now()) : []), [files, dir, searching]);

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
  // Inside a subject's folder: its code, for the overview link.
  const folderSubject = dir ? subjectOfFolder(crumbs[0], files) : null;
  const totalSize = files.reduce((s, f) => s + f.size, 0);

  // A subject's own folder ("Operating_Systems", "OS_21CSC202J") opens its
  // overview, which has everything the folder does and more; the folder is
  // one tap away from there. See subjectOfFolder for how it is recognised.
  const folderRow = (folder: { name: string; path: string; count: number }) => {
    const code = !dir ? subjectOfFolder(folder.name, files) : null;
    const inside = files.filter((f) => f.path.startsWith(`${folder.path}/`));
    // Every file in it is waiting for the Mac: the folder reads as going.
    const deleting = inside.length > 0 && inside.every((f) => pendingByPath.has(f.path));
    const Icon = code ? BookOpen : Folder;
    const body = (
      <>
        <Icon className="h-5 w-5 shrink-0 text-accent" strokeWidth={1.8} />
        <span className="min-w-0 flex-1">
          <span className="block wrap-break-word text-sm font-bold">{prettyName(folder.name)}</span>
          {deleting && <span className="block truncate text-xs font-medium text-muted">Deleting on your Mac at the next sync…</span>}
        </span>
        <span className="shrink-0 text-xs font-semibold text-muted tabular">{folder.count}</span>
      </>
    );
    if (deleting) {
      return (
        <div key={folder.path} className="flex w-full items-center gap-3 py-3.5 pl-4 pr-2">
          <span className="flex min-w-0 flex-1 items-center gap-3 opacity-60">{body}</span>
          <button
            type="button"
            onClick={() => undoFolder(folder.path)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-muted hover:text-ink"
            aria-label={`Keep ${prettyName(folder.name)}`}
          >
            <Undo2 className="h-4 w-4" />
          </button>
        </div>
      );
    }
    const row = (
      <button
        type="button"
        onClick={() => (code ? navigate(`/subject/${code}`) : setDir(folder.path))}
        className="flex w-full items-center gap-3 bg-surface px-4 py-3.5 text-left hover:rounded-2xl hover:outline-solid hover:outline-1 hover:outline-white/80 hover:outline-offset-[-6px]"
      >
        {body}
        <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
      </button>
    );
    if (!canDelete) return <div key={folder.path}>{row}</div>;
    return (
      <SwipeToDelete key={folder.path} onDelete={() => askDeleteFolder(folder.path, files)} label={`Delete ${prettyName(folder.name)}`}>
        {row}
      </SwipeToDelete>
    );
  };


  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-start gap-3 px-1">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-extrabold tracking-tight lg:text-3xl">Study</h1>
          <p className="mt-1 text-sm font-medium text-muted">
            {manifest.data.root} · {files.length} files · {formatSize(totalSize)} · synced {synced(manifest.data.syncedAt)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={sendFiles.isPending || uploads.isError}
          className="mt-1 flex h-10 shrink-0 items-center gap-2 rounded-xl bg-surface-2 px-3 text-sm font-semibold text-ink transition-colors hover:bg-surface-2/70 disabled:opacity-45"
          aria-label={`Upload to ${dir ? prettyName(dir.split("/").pop()!) : manifest.data.root}`}
        >
          <Upload className="h-4 w-4" />
          {sendFiles.isPending ? "Sending…" : "Upload"}
        </button>
        <input
          ref={fileInput}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            pickFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {macQuiet && (
        <section className="card flex items-start gap-3 border-bad/30 px-4 py-3">
          <CloudOff className="mt-0.5 h-4 w-4 shrink-0 text-bad-deep" />
          <p className="text-xs font-medium text-muted">
            <span className="font-semibold text-ink">Your Mac hasn't checked in since {synced(heartbeat.data!)}.</span> Files
            here may be out of date, and deletes and uploads wait until it's back on and online.
          </p>
        </section>
      )}

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
          placeholder="Search, e.g. os unit 1 - Enter searches inside"
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

      {kept.length > 0 && (
        <section className="card space-y-1 px-4 py-3">
          {kept.map((d) => (
            <p key={d.id} className="flex items-start gap-2 text-xs font-medium text-muted">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Kept <span className="font-semibold text-ink">{baseName(d.path)}</span>: {d.note ?? "the Mac couldn't delete it"}.
              </span>
            </p>
          ))}
        </section>
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
            <SearchHitRow key={g.file.key} file={g.file} hits={g.hits} query={deep!} />
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

      {!searching && folderSubject && crumbs.length === 1 && (
        <Link
          to={`/subject/${folderSubject}`}
          className="card flex items-center gap-3 px-4 py-3 text-sm font-semibold transition-colors hover:bg-surface-2/60"
        >
          <Sparkles className="h-4 w-4 shrink-0 text-accent" />
          <span className="min-w-0 flex-1">
            {prettyName(crumbs[0])} overview
            <span className="block text-xs font-medium text-muted">Tests, syllabus, files by unit and past-paper topics</span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
        </Link>
      )}

      {recent.length > 0 && (
        <section className="card divide-y overflow-hidden p-0">
          <button
            type="button"
            onClick={() => setRecentOpen((v) => !v)}
            aria-expanded={recentOpen}
            className="flex w-full items-center gap-3 px-4 py-3 text-left"
          >
            <Clock className="h-4 w-4 shrink-0 text-accent" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold">New &amp; updated</span>
              <span className="block truncate text-xs font-medium text-muted">
                {recent.length} file{recent.length === 1 ? "" : "s"} in the last {RECENT_DAYS} days · latest {baseName(recent[0].path)}
              </span>
            </span>
            <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted transition-transform", recentOpen && "rotate-180")} />
          </button>
          {recentOpen &&
            recent.map((f) => (
              <FileRow
                key={f.path}
                file={f}
                showFolder
                course={courseLinkFor(f, null)}
                deleting={pendingByPath.has(f.path)}
                onDelete={canDelete ? () => askDelete(f) : undefined}
                onUndo={() => undoDelete(f.path)}
                swipeToDelete
              />
            ))}
        </section>
      )}

      <section className="card divide-y overflow-hidden p-0">
        {!searching && view.folders.filter((x) => !isReferenceFolder(dir, x.name)).map(folderRow)}

        {!searching &&
          (uploads.data ?? [])
            .filter((u) => (u.path.includes("/") ? u.path.slice(0, u.path.lastIndexOf("/")) : "") === dir)
            .map((u) => (
              <div key={u.id} className="flex w-full items-center gap-3 py-3.5 pl-4 pr-2">
                <Upload className="h-5 w-5 shrink-0 text-accent" strokeWidth={1.8} />
                <span className="min-w-0 flex-1 opacity-70">
                  <span className="block truncate text-sm font-semibold">{baseName(u.path)}</span>
                  <span className="block truncate text-xs font-medium text-muted">Saving to your Mac at the next sync…</span>
                </span>
                <span className="shrink-0 text-xs font-semibold text-muted tabular">{formatSize(u.size)}</span>
                <button
                  type="button"
                  onClick={() => cancelUpload.mutate(u)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-muted hover:text-ink"
                  aria-label={`Cancel upload of ${baseName(u.path)}`}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}

        {shown.map((f) => (
          <FileRow
            key={f.path}
            file={f}
            showFolder={searching}
            course={courseLinkFor(f, folderSubject)}
            {...syllabusLabel(f)}
            deleting={pendingByPath.has(f.path)}
            onDelete={canDelete ? () => askDelete(f) : undefined}
            onUndo={() => undoDelete(f.path)}
            swipeToDelete
          />
        ))}

        {!searching && view.folders.filter((x) => isReferenceFolder(dir, x.name)).map(folderRow)}

        {searching && results.length === 0 && (
          <p className="px-4 py-8 text-center text-sm font-medium text-muted">No file names match “{query.trim()}”.</p>
        )}
        {!searching && view.folders.length === 0 && view.files.length === 0 && (
          <p className="px-4 py-8 text-center text-sm font-medium text-muted">This folder is empty.</p>
        )}
      </section>
    </div>
  );
}
