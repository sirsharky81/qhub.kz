import type { PDFDocumentProxy } from "pdfjs-dist";

let workerInitialized = false;

/**
 * Initializes the pdfjs worker once for all PDF tools.
 */
export async function initPdfWorker(): Promise<void> {
  if (workerInitialized || typeof window === "undefined") return;

  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  workerInitialized = true;
}

/**
 * Loads a PDF document via pdfjs for thumbnail rendering.
 */
export async function loadPdfDocument(data: Uint8Array): Promise<PDFDocumentProxy> {
  await initPdfWorker();
  const pdfjs = await import("pdfjs-dist");
  const loadingTask = pdfjs.getDocument({ data: data.slice() });
  return loadingTask.promise;
}
