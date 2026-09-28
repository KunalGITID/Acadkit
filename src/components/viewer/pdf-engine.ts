import type { PDFWorker } from "pdfjs-dist";

type PdfLib = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

let engine: Promise<{ lib: PdfLib; worker: PDFWorker }> | null = null;

/** pdf.js and one worker, started once and kept. */
export function pdfEngine(): Promise<{ lib: PdfLib; worker: PDFWorker }> {
  engine ??= (async () => {
    const [lib, src] = await Promise.all([
      import("pdfjs-dist/legacy/build/pdf.mjs"),
      import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"),
    ]);
    lib.GlobalWorkerOptions.workerSrc = src.default;
    return { lib, worker: new lib.PDFWorker() };
  })().catch((e) => {
    engine = null; // let the next open try again
    throw e;
  });
  return engine;
}
