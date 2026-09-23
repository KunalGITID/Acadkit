import {
  File,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  Presentation,
  type LucideIcon,
} from "lucide-react";
import { baseName, extOf, formatSize, opensInBrowser, prettyName, type StudyFile } from "@/lib/studyFiles";

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
