"use client";

import { useCallback, useState } from "react";
import type { AppState, PdfPage } from "../types";
import { trackEvent } from "../lib/analytics";
import { PLAN_LIMITS, currentPlan } from "../lib/limits";
import {
  createPagesFromPdf,
  readPdfFile,
  validatePdfBytes,
} from "../lib/pdfOperations";

const initialState: AppState = {
  pages: [],
  originalBytes: null,
  isLoading: false,
  isProcessing: false,
  error: null,
};

export function usePdfDocument() {
  const [state, setState] = useState<AppState>(initialState);

  const setError = useCallback((error: string | null) => {
    setState((prev) => ({ ...prev, error }));
  }, []);

  const setPages = useCallback((pages: PdfPage[]) => {
    setState((prev) => ({ ...prev, pages }));
  }, []);

  const setOriginalBytes = useCallback((bytes: Uint8Array | null) => {
    setState((prev) => ({ ...prev, originalBytes: bytes }));
  }, []);

  const setIsProcessing = useCallback((isProcessing: boolean) => {
    setState((prev) => ({ ...prev, isProcessing }));
  }, []);

  const loadPdf = useCallback(async (file: File) => {
    const limits = PLAN_LIMITS[currentPlan];

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setState((prev) => ({ ...prev, error: "invalidFile" }));
      return;
    }

    const sizeMb = file.size / (1024 * 1024);
    if (sizeMb > limits.maxFileSizeMb) {
      setState((prev) => ({ ...prev, error: "fileTooBig" }));
      return;
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const loaded = await readPdfFile(file);

      if (loaded.pageCount > limits.maxPages) {
        setState((prev) => ({ ...prev, isLoading: false, error: "tooManyPages" }));
        return;
      }

      const isValid = await validatePdfBytes(loaded.bytes);
      if (!isValid) {
        setState((prev) => ({ ...prev, isLoading: false, error: "corruptedFile" }));
        return;
      }

      const pages = createPagesFromPdf(loaded, `page-${Date.now()}`);

      setState({
        pages,
        originalBytes: loaded.bytes,
        isLoading: false,
        isProcessing: false,
        error: null,
      });

      trackEvent("pdf_upload", {
        pageCount: loaded.pageCount,
        fileSize: file.size,
      });
    } catch {
      setState((prev) => ({ ...prev, isLoading: false, error: "corruptedFile" }));
    }
  }, []);

  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  const updatePage = useCallback((id: string, updates: Partial<PdfPage>) => {
    setState((prev) => ({
      ...prev,
      pages: prev.pages.map((p) => (p.id === id ? { ...p, ...updates } : p)),
    }));
  }, []);

  const updatePages = useCallback((updater: (pages: PdfPage[]) => PdfPage[]) => {
    setState((prev) => ({ ...prev, pages: updater(prev.pages) }));
  }, []);

  return {
    ...state,
    loadPdf,
    reset,
    setError,
    setPages,
    setOriginalBytes,
    setIsProcessing,
    updatePage,
    updatePages,
  };
}
