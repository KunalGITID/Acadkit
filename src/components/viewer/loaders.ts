import type { QueryClient } from "@tanstack/react-query";
import { fetchStudyBlob } from "@/api/studyFiles";
import type { StudyFile } from "@/lib/studyFiles";
import { isRenderable, shownFile, type ViewerKind } from "@/lib/viewer";

/** Everything opening a file waits on, startable ahead of the tap: the viewer's code, each renderer's code, and the file itself. */
export const loadViewerPage = () => import("@/pages/Viewer");
export const loadPdfView = () => import("@/components/viewer/pdf-view");
export const loadDocxView = () => import("@/components/viewer/docx-view");
export const loadPptxView = () => import("@/components/viewer/pptx-view");
export const loadCodeView = () => import("@/components/viewer/code-view");
export const loadSheetView = () => import("@/components/viewer/sheet-view");

const RENDERER: Partial<Record<ViewerKind, () => Promise<unknown>>> = {
  pdf: () => Promise.all([loadPdfView(), import("@/components/viewer/pdf-engine").then((m) => m.pdfEngine())]),
  docx: () => loadDocxView().then(() => import("docx-preview")),
  pptx: () => loadPptxView().then(() => import("pptx-preview")),
  sheet: () => loadSheetView(),
  code: () => loadCodeView().then(() => import("highlight.js/lib/core")),
  text: () => loadCodeView(),
};

/** The file query, shared by the viewer and every prefetch. */
export function studyFileQuery(pin: string, file: StudyFile) {
  const { key } = shownFile(file);
  return {
    queryKey: ["study-file", pin, key] as const,
    queryFn: () => fetchStudyBlob(file, key),
    staleTime: Infinity,
    gcTime: 10 * 60_000,
    retry: 1,
  };
}

const started = new Set<string>();

/** Start opening `file` now: its bytes (from the device cache when it has them) and the code that draws it. */
export function prefetchStudyFile(qc: QueryClient, pin: string, file: StudyFile) {
  const shown = shownFile(file);
  if (!isRenderable(shown.kind)) return;
  void loadViewerPage();
  void RENDERER[shown.kind]?.().catch(() => undefined);
  const id = `${pin}:${shown.key}`;
  if (started.has(id)) return;
  started.add(id);
  void qc.prefetchQuery(studyFileQuery(pin, file)).finally(() => started.delete(id));
}

/** While the Study pages sit open: load the viewer and the PDF engine in the browser's idle time, so the first file opened doesn't wait on a megabyte of code. */
export function warmViewer(): () => void {
  const run = () => {
    void loadViewerPage().catch(() => undefined);
    void RENDERER.pdf!().catch(() => undefined);
  };
  const w = window as Window & { requestIdleCallback?: (cb: () => void) => number; cancelIdleCallback?: (id: number) => void };
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(run);
    return () => w.cancelIdleCallback?.(id);
  }
  const t = window.setTimeout(run, 1200);
  return () => clearTimeout(t);
}
