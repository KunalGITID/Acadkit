import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronLeft, Download, FileQuestion } from "lucide-react";
import { usePin } from "@/hooks/useData";
import { fetchStudyBlob, fetchStudyManifest, studyDownloadUrl } from "@/api/studyFiles";
import { saveFile } from "@/lib/saveFile";
import { baseName, formatSize, prettyName, type StudyFile } from "@/lib/studyFiles";
import { codeLanguage, isRenderable, shownFile, viewerKind } from "@/lib/viewer";
import { ZoomPane } from "@/components/viewer/zoom-pane";
import { cn } from "@/lib/utils";
import {
  loadCodeView,
  loadDocxView,
  loadPdfView,
  loadPptxView,
  loadSheetView,
  studyFileQuery,
} from "@/components/viewer/loaders";
import { DomFind, FindBar, FindButton, MatchRail } from "@/components/viewer/find-bar";
import { useFind } from "@/hooks/useFind";
import type { Finder } from "@/components/viewer/find";

/** Files up to this size are fetched as the viewer opens, so Download can save them from the tap itself. */
const SAVE_AHEAD_BYTES = 40 * 1024 * 1024;

/** A PDF's largest size at 1×, in CSS px per PDF point (1.33 is "actual size"). */
const PDF_PX_PER_POINT = 1.5;

const PdfView = lazy(loadPdfView);
const DocxView = lazy(loadDocxView);
const PptxView = lazy(loadPptxView);
const CodeView = lazy(loadCodeView);
const SheetView = lazy(loadSheetView);

/** A study file, opened inside the app: laid out to the screen, with the file's name and a Download button above it. */
export default function Viewer({ overlay = false }: { overlay?: boolean }) {
  const pin = usePin();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const path = params.get("path") ?? "";
  const page = Number(params.get("page")) || null;

  const manifest = useQuery({ queryKey: ["study-files", pin], queryFn: () => fetchStudyManifest(pin), staleTime: 5 * 60_000 });
  const file = useMemo(() => manifest.data?.files.find((f) => f.path === path) ?? null, [manifest.data, path]);

  // What to render: the file itself, or its converted preview.
  const shown = useMemo(() => (file ? shownFile(file) : null), [file]);
  const renderable = !!shown && isRenderable(shown.kind);

  // "study-file", not the old "study-blob": that key was persisted with the
  // cache, so a phone may hold an {} under it that must never be read.
  // Often already under way: rows prefetch on touch (loaders.ts).
  const blob = useQuery({
    queryKey: ["study-file", pin, shown?.key ?? null],
    queryFn: () => studyFileQuery(pin, file!).queryFn(),
    enabled: !!file && renderable,
    staleTime: Infinity,
    gcTime: 10 * 60_000,
    retry: 1,
  });
  // The original file's bytes, ready before any tap, for Download: iOS only
  // lets the share sheet open straight from a tap (lib/saveFile.ts). When the
  // viewer shows the file itself this is the same query as `blob`; for a
  // converted preview (a note's web version, an old Office file) it's the
  // original, which is what should be saved. Very large files skip it and
  // use the signed link below.
  const original = useQuery({
    queryKey: ["study-file", pin, file?.key ?? null],
    queryFn: () => fetchStudyBlob(file!),
    enabled: !!file && file.size <= SAVE_AHEAD_BYTES,
    staleTime: Infinity,
    gcTime: 10 * 60_000,
    retry: 1,
  });
  const saveable = original.data instanceof Blob ? original.data : null;
  // Fallback for a file too big to hold, or still loading: a signed link,
  // made before any tap since a download started after an await is a
  // blocked pop-up in Safari.
  const download = useQuery({
    queryKey: ["study-download", pin, file?.key],
    queryFn: () => studyDownloadUrl(file!),
    enabled: !!file,
    staleTime: 30 * 60_000,
  });

  // Page 1's width in points, for the PDF's widest at 1× (see ZoomPane below).
  const [pdfPoints, setPdfPoints] = useState<number | null>(null);
  useEffect(() => setPdfPoints(null), [shown?.key]);
    // The PDF's page under the middle of the screen, for the zoom pill.
  const [pages, setPages] = useState<[number, number] | null>(null);
  const onPage = useCallback(
    (current: number, total: number) => setPages((p) => (p && p[0] === current && p[1] === total ? p : [current, total])),
    []
  );

  const [finder, setFinder] = useState<Finder | null>(null);
  const onFinder = useCallback((f: Finder | null) => setFinder(f), []);
  const find = useFind(finder);
  const data = blob.data instanceof Blob ? blob.data : null;

  const title = file ? prettyName(baseName(file.path).replace(/\.[^.]+$/, "")) : "File";
  useEffect(() => {
    document.title = `${title} · AcadKit`;
    return () => {
      document.title = "AcadKit";
    };
  }, [title]);

  // Over a page (see AppRoutes in App.tsx), the page beneath must not move:
  // a drag on this header would otherwise scroll it, and closing the PDF
  // would land somewhere else. Locking the root keeps its scroll offset.
  useEffect(() => {
    if (!overlay) return;
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = before;
    };
  }, [overlay]);

  function back() {
    // Came from inside the app: go back to it. Opened directly: go to Study.
    if (window.history.state?.idx > 0) navigate(-1);
    else navigate(file ? `/files?dir=${encodeURIComponent(file.path.split("/").slice(0, -1).join("/"))}` : "/files");
  }

  return (
    <div className={cn("flex flex-col bg-bg", overlay ? "h-full" : "h-dvh")}>
      <header className="z-20 shrink-0 border-b bg-bg pt-safe-t">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-3 py-2.5">
          <button
            type="button"
            onClick={back}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-ink"
            aria-label="Back"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{title}</p>
            {file && (
              <p className="truncate text-[11px] font-medium text-muted">
                {prettyName(file.path.split("/").slice(0, -1).join(" / ")) || "Study"} · {formatSize(file.size)}
              </p>
            )}
          </div>
          <FindButton find={find} disabled={!finder} />
          {file && (saveable || download.data) ? (
            <SaveLink
              file={file}
              blob={saveable}
              href={download.data}
              // On a phone the label is hidden and only the icon shows.
              label="Download"
              className="flex h-10 shrink-0 items-center gap-2 rounded-xl bg-accent px-3 text-sm font-bold text-white"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Download</span>
            </SaveLink>
          ) : (
            <span className="flex h-10 shrink-0 items-center gap-2 rounded-xl bg-surface-2 px-3 text-sm font-bold text-muted opacity-60">
              <Download className="h-4 w-4" />
            </span>
          )}
        </div>
      </header>
      <FindBar find={find} />

      {file && renderable && data && shown?.kind === "html" ? (
        <HtmlView key={shown.key} blob={data} title={title} />
      ) : file && renderable && data && shown ? (
        <div className="relative flex min-h-0 flex-1 flex-col">
          {/* Everything that renders scrolls and zooms in one box below the
              header (see ZoomPane); the key starts each file at 1×. */}
        <ZoomPane
          key={shown.key}
          className="min-h-0 flex-1"
          mode={shown.kind === "pdf" ? "layout" : "transform"}
          // A PDF at most 1.5 px per point at 1×, like a PDF app's 100%+: fit to a MacBook's width, a phone-sized page (the study folder's own notes, 100 mm wide) came out 3.5× life size.
          maxWidth={shown.kind === "pdf" && pdfPoints ? Math.min(1024, Math.round(pdfPoints * PDF_PX_PER_POINT)) : undefined}
          label={shown.kind === "pdf" && pages ? `${pages[0]} / ${pages[1]}` : undefined}
        >
          {({ width, scroller, content }) => (
            <Suspense fallback={<p className="py-16 text-center text-sm font-medium text-muted">Opening…</p>}>
              {shown.kind === "pdf" && (
                <PdfView
                  blob={data}
                  startPage={page}
                  width={width}
                  scroller={scroller}
                  content={content}
                  onPage={onPage}
                  onFinder={onFinder}
                  onPageWidth={setPdfPoints}
                />
              )}
              {shown.kind === "docx" && <DocxView blob={data} />}
              {shown.kind === "pptx" && <PptxView blob={data} />}
              {shown.kind === "sheet" && <SheetView blob={data} path={file.preview && viewerKind(file.path) === "legacy" ? `x.${file.preview.ext}` : file.path} />}
              {(shown.kind === "code" || shown.kind === "text") && (
                <CodeView blob={data} language={shown.kind === "code" ? codeLanguage(file.path) : null} />
              )}
              {shown.kind === "image" && <ImageView blob={data} alt={title} />}
              {shown.kind !== "pdf" && <DomFind content={content} scroller={scroller} onFinder={onFinder} />}
            </Suspense>
          )}
        </ZoomPane>
        <MatchRail find={find} />
        </div>
      ) : (
        <main className="mx-auto w-full max-w-5xl min-h-0 flex-1 overflow-auto px-3 pt-3 sm:px-6">
          {manifest.isLoading && <p className="py-16 text-center text-sm font-medium text-muted">Opening…</p>}
          {manifest.data && !file && <NoPreview message="This file isn't in your study folder any more." />}
          {file && !renderable && (
            <NoPreview
              message={
                shown?.kind === "legacy"
                  ? "This is an old-format Office file (.doc, .ppt or .xls). Your Mac converts these at its next sync so they open here; until then, download it."
                  : "This kind of file can't be shown here. Download it to open it."
              }
              file={file}
              blob={saveable}
              href={download.data}
            />
          )}
          {file && renderable && blob.isLoading && <p className="py-16 text-center text-sm font-medium text-muted">Opening…</p>}
          {file && renderable && blob.isError && (
            <NoPreview message="Couldn't load this file. Check your connection and try again." file={file} blob={saveable} href={download.data} />
          )}
        </main>
      )}
    </div>
  );
}

/** A note's web version (md2pdf.py's build_html), filling the space under the header and reflowing to it. */
function HtmlView({ blob, title }: { blob: Blob; title: string }) {
  const [doc, setDoc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void blob.text().then((t) => alive && setDoc(t.replace("<head>", '<head><base target="_blank">')));
    return () => {
      alive = false;
    };
  }, [blob]);
  if (doc == null) return <p className="py-16 text-center text-sm font-medium text-muted">Opening…</p>;
  return (
    <iframe
      title={title}
      srcDoc={doc}
      sandbox="allow-popups allow-popups-to-escape-sandbox"
      className="min-h-0 w-full flex-1 border-0 bg-[#0E1116]"
    />
  );
}

function ImageView({ blob, alt }: { blob: Blob; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url ? <img src={url} alt={alt} className="mx-auto mb-16 h-auto max-w-full rounded-xl" /> : null;
}

function NoPreview({ message, file, blob, href }: { message: string; file?: StudyFile; blob?: Blob | null; href?: string }) {
  return (
    <div className="card mx-auto mt-6 flex max-w-md flex-col items-center gap-3 p-6 text-center">
      <FileQuestion className="h-8 w-8 text-muted" />
      <p className="text-sm font-medium text-muted">{message}</p>
      {file && (blob || href) && (
        <SaveLink file={file} blob={blob ?? null} href={href} className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-white">
          <Download className="h-4 w-4" /> Download {baseName(file.path)}
        </SaveLink>
      )}
    </div>
  );
}

/**
 * Download: the bytes, saved from the tap itself (the share sheet on an
 * iPhone, a named download elsewhere) when they're here; otherwise the
 * signed link, as before.
 */
function SaveLink({ file, blob, href, label, className, children }: {
  file: StudyFile;
  blob: Blob | null;
  href?: string;
  label?: string;
  className: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href ?? "#"}
      aria-label={label}
      download={baseName(file.path)}
      className={className}
      onClick={(e) => {
        if (!blob) return; // let the signed link do it
        e.preventDefault();
        saveFile(blob, baseName(file.path));
      }}
    >
      {children}
    </a>
  );
}
