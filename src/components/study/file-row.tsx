import {
  File,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  Presentation,
  type LucideIcon,
} from "lucide-react";
import {
  baseName,
  extOf,
  formatSize,
  highlight,
  opensInBrowser,
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

export function FileRow({ file, href, showFolder }: { file: StudyFile; href?: string; showFolder: boolean }) {
  const Icon = ICONS[extOf(file.path)] ?? File;
  const folder = file.path.includes("/") ? file.path.slice(0, file.path.lastIndexOf("/")) : "";
  const body = (
    <>
      <Icon className="h-5 w-5 shrink-0 text-muted" strokeWidth={1.8} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{baseName(file.path)}</span>
        {showFolder && folder && (
          <span className="block truncate text-xs font-medium text-muted">{prettyName(folder)}</span>
        )}
      </span>
      <span className="shrink-0 text-xs font-semibold text-muted tabular">
        {formatSize(file.size)}
        {!opensInBrowser(file.path) && " ↓"}
      </span>
    </>
  );
  const row = "flex w-full items-center gap-3 px-4 py-3.5 text-left";
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`${row} transition-colors hover:bg-surface-2/60`}>
      {body}
    </a>
  ) : (
    <div className={`${row} opacity-60`} aria-busy="true">
      {body}
    </div>
  );
}

/**
 * A file found by meaning: its best passage, the words that matched,
 * and — for paged formats — the page it's on, which the link opens at.
 */
export function SearchHitRow({
  file,
  hits,
  query,
  href,
}: {
  file: StudyFile;
  hits: StudyHit[];
  query: string;
  href?: string;
}) {
  const Icon = ICONS[extOf(file.path)] ?? File;
  const folder = file.path.includes("/") ? file.path.slice(0, file.path.lastIndexOf("/")) : "";
  const best = hits[0];
  const pages = [...new Set(hits.map((h) => h.page).filter((p): p is number => p !== null))];
  // Browsers' PDF viewers open at #page=N; signed links carry a query, not a fragment.
  const link = href && best.page && extOf(file.path) === "pdf" ? `${href}#page=${best.page}` : href;
  const body = (
    <>
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-muted" strokeWidth={1.8} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{baseName(file.path)}</span>
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
  return link ? (
    <a href={link} target="_blank" rel="noopener noreferrer" className={`${row} transition-colors hover:bg-surface-2/60`}>
      {body}
    </a>
  ) : (
    <div className={`${row} opacity-60`} aria-busy="true">
      {body}
    </div>
  );
}
