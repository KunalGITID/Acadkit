import { useRef } from "react";
import { Link } from "react-router-dom";
import { motion, useMotionValue, useTransform } from "framer-motion";
import { viewerHref } from "@/lib/viewer";
import { usePrefetchFile } from "@/hooks/usePrefetchFile";
import { useViewerLinkState } from "@/hooks/useViewerLink";
import {
  File,
  FileCode,
  GraduationCap,
  FileImage,
  FileSpreadsheet,
  FileText,
  Presentation,
  Trash2,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import {
  baseName,
  extOf,
  formatSize,
  highlight,
  prettyName,
  type StudyFile,
  type StudyHit,
} from "@/lib/studyFiles";

const ICONS: Record<string, LucideIcon> = {
  pdf: FileText,
  docx: FileText,
  md: FileText,
  txt: FileText,
  pptx: Presentation,
  xlsx: FileSpreadsheet,
  csv: FileSpreadsheet,
  png: FileImage,
  jpg: FileImage,
  jpeg: FileImage,
  c: FileCode,
  py: FileCode,
  java: FileCode,
  html: FileCode,
};

/**
 * One file. With `onDelete`, a trash button sits beside it; while a
 * delete is waiting for the Mac (`deleting`), the row dims, says so, and
 * offers `onUndo` instead.
 */
export function FileRow({
  file,
  showFolder,
  onDelete,
  deleting,
  onUndo,
  course,
  title,
  note,
  swipeToDelete,
}: {
  file: StudyFile;
  showFolder: boolean;
  onDelete?: () => void;
  deleting?: boolean;
  onUndo?: () => void;
  /** A course code: a button beside the file opens that course's page (a syllabus filed away from its subject). */
  course?: string | null;
  /** Shown instead of the file name - a syllabus reads as its course's name. */
  title?: string | null;
  /** Shown under it instead of the folder. */
  note?: string | null;
  /** Swipe the row right to delete it, instead of a trash button beside it. */
  swipeToDelete?: boolean;
}) {
  const prefetch = usePrefetchFile();
  const viewerState = useViewerLinkState();
  const Icon = ICONS[extOf(file.path)] ?? File;
  const folder = file.path.includes("/") ? file.path.slice(0, file.path.lastIndexOf("/")) : "";
  const body = (
    <>
      <Icon className="h-5 w-5 shrink-0 text-muted" strokeWidth={1.8} />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 block break-words text-sm font-semibold">{title || baseName(file.path)}</span>
        {deleting ? (
          <span className="block truncate text-xs font-medium text-muted">Deleting on your Mac at the next sync…</span>
        ) : note ? (
          <span className="block truncate text-xs font-medium text-muted">{note}</span>
        ) : (
          showFolder &&
          folder && <span className="block truncate text-xs font-medium text-muted">{prettyName(folder)}</span>
        )}
      </span>
      <span className="shrink-0 text-xs font-semibold text-muted tabular">
        {formatSize(file.size)}
      </span>
    </>
  );
  const row = "flex min-w-0 flex-1 items-center gap-3 py-3.5 pl-4 text-left";
  const main = !deleting ? (
      // Opens in the app's viewer. Not natively draggable: a browser's own
      // link drag would swallow the swipe.
      <Link to={viewerHref(file.path)} state={viewerState} draggable={false} {...prefetch(file)} className={row}>
        {body}
      </Link>
    ) : (
      <div className={`${row} opacity-60`} aria-busy={!deleting || undefined}>
        {body}
      </div>
    );
  const side = "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-muted hover:text-ink";
  const swipe = swipeToDelete && !!onDelete && !deleting;
  const content = (
    <div className="flex w-full items-center gap-1 bg-surface pr-2 hover:rounded-2xl hover:outline hover:outline-1 hover:outline-white/80 hover:[outline-offset:-6px]">
      {main}
      {course && !deleting && (
        <Link
          to={`/subject/${course}`}
          className={`${side} text-accent hover:text-accent`}
          aria-label={`Open the ${course} course page`}
          title="Course page: chapters and topics"
        >
          <GraduationCap className="h-4 w-4" />
        </Link>
      )}
      {deleting && onUndo ? (
        <button type="button" onClick={onUndo} className={side} aria-label={`Keep ${baseName(file.path)}`}>
          <Undo2 className="h-4 w-4" />
        </button>
      ) : (
        onDelete &&
        !deleting &&
        !swipe && (
          <button
            type="button"
            onClick={onDelete}
            className={`${side} hover:text-bad-deep`}
            aria-label={`Delete ${baseName(file.path)}`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )
      )}
      {!onDelete && !onUndo && <span className="w-2" />}
    </div>
  );
  if (!swipe) return content;
  return <SwipeToDelete onDelete={onDelete!} label={`Delete ${baseName(file.path)}`}>{content}</SwipeToDelete>;
}

/** How far right a row has to be dragged to count as "delete it". */
const SWIPE_DELETE_PX = 96;

/** Drag right to delete. */
export function SwipeToDelete({ children, onDelete, label }: { children: React.ReactNode; onDelete: () => void; label: string }) {
  const x = useMotionValue(0);
  // Invisible until the row actually moves: at rest the strip showed through
  // a touched row's highlight as a red "Delete".
  const reveal = useTransform(x, [0, 8, SWIPE_DELETE_PX], [0, 0.35, 1]);
  const dragged = useRef(false);
  return (
    <div className="relative overflow-hidden">
      <motion.div
        aria-hidden
        style={{ opacity: reveal }}
        className="absolute inset-0 flex items-center gap-2 bg-bad pl-5 text-sm font-bold text-white"
      >
        <Trash2 className="h-4 w-4" /> Delete
      </motion.div>
      <motion.div
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0, right: 0.7 }}
        dragSnapToOrigin
        style={{ x, touchAction: "pan-y" }}
        onDragStart={() => (dragged.current = true)}
        onDragEnd={(_, info) => {
          if (info.offset.x > SWIPE_DELETE_PX) onDelete();
          // Cleared after the click this drag would otherwise fire.
          setTimeout(() => (dragged.current = false), 0);
        }}
        onClickCapture={(e) => {
          if (dragged.current) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
        className="relative"
      >
        {children}
      </motion.div>
      <button type="button" onClick={onDelete} className="sr-only">
        {label}
      </button>
    </div>
  );
}

/**
 * A file found by meaning: its best passage, the words that matched,
 * and - for paged formats - the page it's on, which the link opens at.
 */
export function SearchHitRow({ file, hits, query }: { file: StudyFile; hits: StudyHit[]; query: string }) {
  const prefetch = usePrefetchFile();
  const viewerState = useViewerLinkState();
  const Icon = ICONS[extOf(file.path)] ?? File;
  const folder = file.path.includes("/") ? file.path.slice(0, file.path.lastIndexOf("/")) : "";
  const best = hits[0];
  const pages = [...new Set(hits.map((h) => h.page).filter((p): p is number => p !== null))];
  const body = (
    <>
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-muted" strokeWidth={1.8} />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 block break-words text-sm font-semibold">{baseName(file.path)}</span>
        <span className="block truncate text-xs font-medium text-muted">
          {folder && prettyName(folder)}
          {pages.length > 0 && ` · p. ${pages.slice(0, 4).join(", ")}${pages.length > 4 ? "…" : ""}`}
        </span>
        <span className="mt-1 line-clamp-3 block text-xs font-medium text-ink/80">
          {highlight(best.content, query).map((part, i) =>
            part.hit ? (
              <mark key={i} className="rounded bg-accent/20 px-0.5 font-semibold text-ink">
                {part.text}
              </mark>
            ) : (
              <span key={i}>{part.text}</span>
            )
          )}
        </span>
      </span>
    </>
  );
  const row = "flex w-full items-start gap-3 px-4 py-3.5 text-left";
  // A PDF opens at the page the passage is on.
  return (
    <Link
      to={viewerHref(file.path, extOf(file.path) === "pdf" ? best.page : null)}
      state={viewerState}
      {...prefetch(file)}
      className={`${row} hover:rounded-2xl hover:outline hover:outline-1 hover:outline-white/80 hover:[outline-offset:-6px]`}
    >
      {body}
    </Link>
  );
}
