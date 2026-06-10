import { PDFDocument, degrees, type PDFPage } from "pdf-lib";
import type { PageRotation, PdfPage } from "../types";
import { parsePageRanges } from "./rangeParser";

export interface LoadedPdf {
  bytes: Uint8Array;
  pageCount: number;
  fileName: string;
}

/**
 * Reads a File as Uint8Array and validates it is a PDF.
 */
export async function readPdfFile(file: File): Promise<LoadedPdf> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: false });
  return {
    bytes,
    pageCount: doc.getPageCount(),
    fileName: file.name,
  };
}

/**
 * Creates PdfPage entries from a loaded PDF without thumbnails.
 */
export function createPagesFromPdf(
  loaded: LoadedPdf,
  idPrefix: string,
): PdfPage[] {
  return Array.from({ length: loaded.pageCount }, (_, index) => ({
    id: `${idPrefix}-${index}`,
    pageIndex: index,
    rotation: 0 as PageRotation,
    thumbnail: null,
    selected: false,
    sourceFile: loaded.fileName,
  }));
}

/**
 * Builds a PDF from the current page list with rotations applied.
 */
export async function buildPdfFromPages(
  originalBytes: Uint8Array,
  pages: PdfPage[],
): Promise<Uint8Array> {
  const sourceDoc = await PDFDocument.load(originalBytes);
  const newDoc = await PDFDocument.create();

  for (const page of pages) {
    const [copied] = await newDoc.copyPages(sourceDoc, [page.pageIndex]);
    if (page.rotation !== 0) {
      copied.setRotation(degrees(page.rotation));
    }
    newDoc.addPage(copied);
  }

  return newDoc.save();
}

/**
 * Extracts selected pages into a new PDF blob.
 */
export async function extractPages(
  originalBytes: Uint8Array,
  pages: PdfPage[],
  selectedIds: Set<string>,
): Promise<Uint8Array> {
  const selected = pages.filter((p) => selectedIds.has(p.id));
  if (selected.length === 0) {
    throw new Error("no_selection");
  }
  return buildPdfFromPages(originalBytes, selected);
}

/**
 * Merges multiple PDF files into one document.
 */
export async function mergePdfs(files: Uint8Array[]): Promise<Uint8Array> {
  const merged = await PDFDocument.create();

  for (const bytes of files) {
    const doc = await PDFDocument.load(bytes);
    const copied = await merged.copyPages(doc, doc.getPageIndices());
    copied.forEach((page) => merged.addPage(page));
  }

  return merged.save();
}

export interface SplitResult {
  name: string;
  bytes: Uint8Array;
}

/**
 * Splits a PDF into separate files — one per page or by range groups.
 */
export async function splitPdf(
  bytes: Uint8Array,
  fileName: string,
  mode: "each" | "ranges",
  rangeInput?: string,
): Promise<SplitResult[]> {
  const sourceDoc = await PDFDocument.load(bytes);
  const totalPages = sourceDoc.getPageCount();
  const baseName = fileName.replace(/\.pdf$/i, "");

  if (mode === "each") {
    const results: SplitResult[] = [];
    for (let i = 0; i < totalPages; i++) {
      const newDoc = await PDFDocument.create();
      const [page] = await newDoc.copyPages(sourceDoc, [i]);
      newDoc.addPage(page);
      results.push({
        name: `${baseName}_page_${i + 1}.pdf`,
        bytes: await newDoc.save(),
      });
    }
    return results;
  }

  const ranges = parsePageRanges(rangeInput ?? "", totalPages);
  if (ranges.length === 0) {
    throw new Error("invalid_ranges");
  }

  const newDoc = await PDFDocument.create();
  const indices = ranges.map((p) => p - 1);
  const copied = await newDoc.copyPages(sourceDoc, indices);
  copied.forEach((page) => newDoc.addPage(page));

  const rangeLabel = rangeInput?.replace(/\s/g, "") ?? "split";
  return [
    {
      name: `${baseName}_${rangeLabel}.pdf`,
      bytes: await newDoc.save(),
    },
  ];
}

/**
 * Adds pages from another PDF to the current page list metadata.
 */
export async function appendPdfPages(
  existingBytes: Uint8Array,
  newFile: Uint8Array,
  newFileName: string,
  existingPages: PdfPage[],
  idPrefix: string,
): Promise<{ bytes: Uint8Array; pages: PdfPage[] }> {
  const merged = await mergePdfs([existingBytes, newFile]);
  const newDoc = await PDFDocument.load(newFile);
  const newPageCount = newDoc.getPageCount();
  const startIndex = existingPages.length;

  const addedPages: PdfPage[] = Array.from({ length: newPageCount }, (_, i) => ({
    id: `${idPrefix}-${startIndex + i}`,
    pageIndex: startIndex + i,
    rotation: 0 as PageRotation,
    thumbnail: null,
    selected: false,
    sourceFile: newFileName,
  }));

  return {
    bytes: merged,
    pages: [...existingPages, ...addedPages],
  };
}

/**
 * Rebuilds originalBytes after page deletions or reordering.
 */
export async function syncBytesWithPages(
  originalBytes: Uint8Array,
  pages: PdfPage[],
): Promise<Uint8Array> {
  if (pages.length === 0) {
    throw new Error("no_pages");
  }
  return buildPdfFromPages(originalBytes, pages);
}

const THUMBNAIL_SCALE = 0.35;

/**
 * Renders a single page thumbnail from an already-loaded pdf.js document.
 * Cleans up page references and supports render task cancellation.
 */
export async function renderPageThumbnail(
  doc: import("pdfjs-dist").PDFDocumentProxy,
  pageIndex: number,
  scale = THUMBNAIL_SCALE,
  registerCancel?: (cancel: () => void) => void,
): Promise<string> {
  const page = await doc.getPage(pageIndex + 1);

  try {
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("canvas_unavailable");
    }

    const renderTask = page.render({ canvasContext: context, viewport, canvas });
    registerCancel?.(() => renderTask.cancel());

    await renderTask.promise;
    return canvas.toDataURL("image/jpeg", 0.75);
  } finally {
    page.cleanup();
  }
}

/**
 * Renders a single page thumbnail as a data URL via canvas.
 */
export async function renderThumbnail(
  pdfData: Uint8Array,
  pageIndex: number,
  scale = THUMBNAIL_SCALE,
): Promise<string> {
  const { createPdfLoadingTask } = await import("../../_pdf-shared/pdfWorker");
  const loadingTask = await createPdfLoadingTask(pdfData);
  try {
    const doc = await loadingTask.promise;
    return await renderPageThumbnail(doc, pageIndex, scale);
  } finally {
    await loadingTask.destroy();
  }
}

/**
 * Triggers a browser download for PDF bytes.
 */
export function downloadPdf(bytes: Uint8Array, fileName: string): void {
  const blob = new Blob([bytes.slice()], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * Applies rotation increment of 90° clockwise to a page rotation value.
 */
export function rotateClockwise(current: PageRotation): PageRotation {
  return ((current + 90) % 360) as PageRotation;
}

/**
 * Maps reordered pages to updated pageIndex values after a rebuild.
 */
export function remapPageIndices(pages: PdfPage[]): PdfPage[] {
  return pages.map((page, index) => ({
    ...page,
    pageIndex: index,
    id: page.id,
  }));
}

/**
 * Returns page indices (0-based) to delete from range input.
 */
export function getDeleteIndices(rangeInput: string, totalPages: number): number[] {
  const oneBased = parsePageRanges(rangeInput, totalPages);
  return oneBased.map((p) => p - 1);
}

/**
 * Validates that bytes represent a loadable PDF.
 */
export async function validatePdfBytes(bytes: Uint8Array): Promise<boolean> {
  try {
    await PDFDocument.load(bytes);
    return true;
  } catch {
    return false;
  }
}

/**
 * Copies a PDFPage rotation from pdf-lib degrees to our PageRotation type.
 */
export function normalizeRotation(angle: number): PageRotation {
  const normalized = ((angle % 360) + 360) % 360;
  if (normalized === 90 || normalized === 180 || normalized === 270) {
    return normalized as PageRotation;
  }
  return 0;
}

/**
 * Gets embedded page size for layout hints (unused in UI but available for future tools).
 */
export async function getPageDimensions(page: PDFPage): Promise<{ width: number; height: number }> {
  const { width, height } = page.getSize();
  return { width, height };
}
