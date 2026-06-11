"use client";

import { useCallback } from "react";
import type { PdfActionMode, PdfPage, SplitMode } from "../types";
import { trackEvent } from "../lib/analytics";
import { PLAN_LIMITS, currentPlan } from "../lib/limits";
import {
  appendPdfPages,
  createPagesFromPdf,
  downloadPdf,
  extractPages,
  getDeleteIndices,
  mergePdfs,
  readPdfFile,
  rotateClockwise,
  splitPdf,
  syncBytesWithPages,
  validatePdfBytes,
} from "../lib/pdfOperations";
import { ThumbnailCache } from "../lib/thumbnailCache";

interface UsePdfActionsParams {
  pages: PdfPage[];
  originalBytes: Uint8Array | null;
  setPages: (pages: PdfPage[], originalBytes?: Uint8Array) => void;
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
        prev.map((p) => {
          if (!ids.has(p.id)) return p;
          ThumbnailCache.delete(p.id);
          return {
            ...p,
            rotation: rotateClockwise(p.rotation),
            thumbnail: null,
          };
        }),
      );
      trackEvent("pdf_rotate_pages", { selectedCount: ids.size });
    },
    [updatePages],
  );

  const reorderPages = useCallback(
    (reordered: PdfPage[]) => {
      setPages(reordered);
      trackEvent("pdf_reorder_pages", { pageCount: reordered.length });
    },
    [setPages],
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

  /**
   * Appends one or more PDF files to the end of the current document.
   */
  const appendPdfFiles = useCallback(
    async (files: File[]) => {
      if (!originalBytes || files.length === 0) return;

      const limits = PLAN_LIMITS[currentPlan];
      setIsProcessing(true);

      try {
        let currentBytes = await syncBytesWithPages(originalBytes, pages);
        let currentPages = [...pages];

        for (const file of files) {
          const newBytes = new Uint8Array(await file.arrayBuffer());
          const result = await appendPdfPages(
            currentBytes,
            newBytes,
            file.name,
            currentPages,
            `page-${Date.now()}`,
          );
          currentBytes = result.bytes;
          currentPages = result.pages;
        }

        const nextPages = currentPages.map((p) => ({
          ...p,
          thumbnail: ThumbnailCache.get(p.id) ?? p.thumbnail,
          selected: false,
        }));

        setPages(nextPages, currentBytes);
        trackEvent("pdf_merge", {
          pageCount: nextPages.length,
          selectedCount: files.length,
        });
      } catch {
        setError("corruptedFile");
      } finally {
        setIsProcessing(false);
      }
    },
    [originalBytes, pages, setError, setIsProcessing, setPages],
  );

  /**
   * Imports multiple PDFs as a new document (empty state / combine on upload).
   */
  const importPdfFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;

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
          const isValid = await validatePdfBytes(bytes);
          if (!isValid) {
            setError("corruptedFile");
            setIsProcessing(false);
            return;
          }
          allBytes.push(bytes);
          const loaded = await readPdfFile(file);
          totalPages += loaded.pageCount;
        }

        if (totalPages > limits.maxPages) {
          setError("tooManyPages");
          setIsProcessing(false);
          return;
        }

        const merged = await mergePdfs(allBytes);
        const prefix = `import-${Date.now()}`;
        const allPages: PdfPage[] = [];

        for (let i = 0; i < files.length; i++) {
          const loaded = await readPdfFile(files[i]);
          const filePages = await createPagesFromPdf(loaded, `${prefix}-${i}`);
          const offset = allPages.length;
          allPages.push(
            ...filePages.map((p, idx) => ({
              ...p,
              id: `${prefix}-${offset + idx}`,
              pageIndex: offset + idx,
            })),
          );
        }

        ThumbnailCache.clear();
        setPages(allPages, merged);
        setError(null);
        trackEvent("pdf_merge", { pageCount: allPages.length, fileSize: merged.byteLength });
      } catch {
        setError("corruptedFile");
      } finally {
        setIsProcessing(false);
      }
    },
    [setError, setIsProcessing, setPages],
  );

  const splitDocument = useCallback(
    async (fileName: string, mode: SplitMode, rangeInput?: string) => {
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
    appendPdfFiles,
    importPdfFiles,
    splitDocument,
    downloadDocument,
  };
}

export type { PdfActionMode };
