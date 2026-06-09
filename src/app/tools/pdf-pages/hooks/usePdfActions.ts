"use client";

import { useCallback } from "react";
import type { PdfActionMode, PdfPage, SplitMode } from "../types";
import { trackEvent } from "../lib/analytics";
import { PLAN_LIMITS, currentPlan } from "../lib/limits";
import {
  appendPdfPages,
  downloadPdf,
  extractPages,
  getDeleteIndices,
  mergePdfs,
  rotateClockwise,
  splitPdf,
  syncBytesWithPages,
} from "../lib/pdfOperations";

interface UsePdfActionsParams {
  pages: PdfPage[];
  originalBytes: Uint8Array | null;
  setPages: (pages: PdfPage[]) => void;
  setOriginalBytes: (bytes: Uint8Array | null) => void;
  setIsProcessing: (value: boolean) => void;
  setError: (error: string | null) => void;
  updatePages: (updater: (pages: PdfPage[]) => PdfPage[]) => void;
}

export function usePdfActions({
  pages,
  originalBytes,
  setPages,
  setOriginalBytes,
  setIsProcessing,
  setError,
  updatePages,
}: UsePdfActionsParams) {
  const deletePages = useCallback(
    async (ids: Set<string>) => {
      if (ids.size === 0 || !originalBytes) return;

      setIsProcessing(true);
      try {
        const remaining = pages.filter((p) => !ids.has(p.id));
        if (remaining.length === 0) {
          setError("noPagesLeft");
          setIsProcessing(false);
          return;
        }

        const newBytes = await syncBytesWithPages(originalBytes, remaining);
        const remapped = remaining.map((p, i) => ({
          ...p,
          pageIndex: i,
          thumbnail: null,
          selected: false,
        }));

        setOriginalBytes(newBytes);
        setPages(remapped);
        trackEvent("pdf_delete_pages", { selectedCount: ids.size, pageCount: remapped.length });
      } catch {
        setError("processingFailed");
      } finally {
        setIsProcessing(false);
      }
    },
    [originalBytes, pages, setError, setIsProcessing, setOriginalBytes, setPages],
  );

  const deleteByRange = useCallback(
    async (rangeInput: string) => {
      const indices = new Set(getDeleteIndices(rangeInput, pages.length));
      const ids = new Set(pages.filter((_, i) => indices.has(i)).map((p) => p.id));
      await deletePages(ids);
    },
    [deletePages, pages],
  );

  const rotatePages = useCallback(
    (ids: Set<string>) => {
      if (ids.size === 0) return;
      updatePages((prev) =>
        prev.map((p) =>
          ids.has(p.id) ? { ...p, rotation: rotateClockwise(p.rotation) } : p,
        ),
      );
      trackEvent("pdf_rotate_pages", { selectedCount: ids.size });
    },
    [updatePages],
  );

  const reorderPages = useCallback(
    async (reordered: PdfPage[]) => {
      if (!originalBytes) return;

      setIsProcessing(true);
      try {
        const remapped = reordered.map((p, i) => ({
          ...p,
          pageIndex: i,
          thumbnail: null,
        }));
        const newBytes = await syncBytesWithPages(originalBytes, remapped);
        setOriginalBytes(newBytes);
        setPages(remapped);
        trackEvent("pdf_reorder_pages", { pageCount: remapped.length });
      } catch {
        setError("processingFailed");
      } finally {
        setIsProcessing(false);
      }
    },
    [originalBytes, setError, setIsProcessing, setOriginalBytes, setPages],
  );

  const extractSelected = useCallback(
    async (selectedIds: Set<string>, fileName: string) => {
      if (!originalBytes || selectedIds.size === 0) return;

      setIsProcessing(true);
      try {
        const synced = await syncBytesWithPages(originalBytes, pages);
        const bytes = await extractPages(synced, pages, selectedIds);
        downloadPdf(bytes, fileName.replace(/\.pdf$/i, "") + "_extracted.pdf");
        trackEvent("pdf_extract_pages", { selectedCount: selectedIds.size });
      } catch {
        setError("processingFailed");
      } finally {
        setIsProcessing(false);
      }
    },
    [originalBytes, pages, setError, setIsProcessing],
  );

  const addPdfFile = useCallback(
    async (file: File) => {
      if (!originalBytes) return;

      const limits = PLAN_LIMITS[currentPlan];
      const fileCount = new Set(pages.map((p) => p.sourceFile)).size;
      if (fileCount >= limits.maxFiles) {
        setError("tooManyFiles");
        return;
      }

      setIsProcessing(true);
      try {
        const newBytes = new Uint8Array(await file.arrayBuffer());
        const currentBytes = await syncBytesWithPages(originalBytes, pages);
        const result = await appendPdfPages(
          currentBytes,
          newBytes,
          file.name,
          pages,
          `page-${Date.now()}`,
        );

        setOriginalBytes(result.bytes);
        setPages(
          result.pages.map((p) => ({ ...p, thumbnail: null, selected: false })),
        );
        trackEvent("pdf_merge", { pageCount: result.pages.length });
      } catch {
        setError("corruptedFile");
      } finally {
        setIsProcessing(false);
      }
    },
    [originalBytes, pages, setError, setIsProcessing, setOriginalBytes, setPages],
  );

  const mergeFiles = useCallback(
    async (files: File[]) => {
      const limits = PLAN_LIMITS[currentPlan];
      if (files.length > limits.maxFiles) {
        setError("tooManyFiles");
        return;
      }

      setIsProcessing(true);
      try {
        const allBytes: Uint8Array[] = [];
        let totalPages = 0;

        for (const file of files) {
          const bytes = new Uint8Array(await file.arrayBuffer());
          allBytes.push(bytes);
          const { PDFDocument } = await import("pdf-lib");
          const doc = await PDFDocument.load(bytes);
          totalPages += doc.getPageCount();
        }

        if (totalPages > limits.maxPages) {
          setError("tooManyPages");
          setIsProcessing(false);
          return;
        }

        const merged = await mergePdfs(allBytes);
        const { PDFDocument } = await import("pdf-lib");
        const doc = await PDFDocument.load(merged);
        const mergedPages: PdfPage[] = Array.from({ length: doc.getPageCount() }, (_, i) => ({
          id: `merged-${Date.now()}-${i}`,
          pageIndex: i,
          rotation: 0,
          thumbnail: null,
          selected: false,
          sourceFile: files[Math.min(i, files.length - 1)]?.name ?? "merged.pdf",
        }));

        setOriginalBytes(merged);
        setPages(mergedPages);
        trackEvent("pdf_merge", { pageCount: mergedPages.length, fileSize: merged.byteLength });
      } catch {
        setError("corruptedFile");
      } finally {
        setIsProcessing(false);
      }
    },
    [setError, setIsProcessing, setOriginalBytes, setPages],
  );

  const splitDocument = useCallback(
    async (
      fileName: string,
      mode: SplitMode,
      rangeInput?: string,
    ) => {
      if (!originalBytes) return;

      setIsProcessing(true);
      try {
        const currentBytes = await syncBytesWithPages(originalBytes, pages);
        const results = await splitPdf(currentBytes, fileName, mode, rangeInput);

        for (const result of results) {
          downloadPdf(result.bytes, result.name);
        }

        trackEvent("pdf_split", { pageCount: results.length });
      } catch {
        setError("processingFailed");
      } finally {
        setIsProcessing(false);
      }
    },
    [originalBytes, pages, setError, setIsProcessing],
  );

  const downloadDocument = useCallback(
    async (fileName: string) => {
      if (!originalBytes) return;

      setIsProcessing(true);
      try {
        const bytes = await syncBytesWithPages(originalBytes, pages);
        downloadPdf(bytes, fileName);
        trackEvent("pdf_download", { pageCount: pages.length });
      } catch {
        setError("processingFailed");
      } finally {
        setIsProcessing(false);
      }
    },
    [originalBytes, pages, setError, setIsProcessing],
  );

  return {
    deletePages,
    deleteByRange,
    rotatePages,
    reorderPages,
    extractSelected,
    addPdfFile,
    mergeFiles,
    splitDocument,
    downloadDocument,
  };
}

export type { PdfActionMode };
