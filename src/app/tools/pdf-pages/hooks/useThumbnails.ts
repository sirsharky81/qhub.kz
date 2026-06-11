"use client";

import { useCallback, useEffect, useRef } from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import type { PdfPage } from "../types";
import { renderPageThumbnail } from "../lib/pdfOperations";
import { RenderQueue } from "../lib/renderQueue";
import { ThumbnailCache } from "../lib/thumbnailCache";
import { createPdfLoadingTask } from "../../_pdf-shared/pdfWorker";

const RENDER_CONCURRENCY = 2;

interface UseThumbnailsOptions {
  pdfBytes: Uint8Array | null;
  pages: PdfPage[];
  onThumbnailReady: (pageId: string, thumbnail: string) => void;
}

/**
 * Lazily generates thumbnails for visible pages.
 * Rendered images are stored in ThumbnailCache (module scope) so they survive pdfBytes updates.
 */
export function useThumbnails({
  pdfBytes,
  pages,
  onThumbnailReady,
}: UseThumbnailsOptions) {
  const queueRef = useRef(new RenderQueue(RENDER_CONCURRENCY));
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const loadingTaskRef = useRef<PDFDocumentLoadingTask | null>(null);
  const docLoadRef = useRef<Promise<PDFDocumentProxy> | null>(null);
  const renderedIdsRef = useRef(new Set<string>());
  const pdfGenerationRef = useRef(0);
  const pagesRef = useRef(pages);
  const onThumbnailReadyRef = useRef(onThumbnailReady);

  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  useEffect(() => {
    onThumbnailReadyRef.current = onThumbnailReady;
  }, [onThumbnailReady]);

  const resetDocument = useCallback(() => {
    queueRef.current.clear();
    queueRef.current.reset();

    if (loadingTaskRef.current) {
      void loadingTaskRef.current.destroy();
      loadingTaskRef.current = null;
    }
    docRef.current = null;
    docLoadRef.current = null;
    renderedIdsRef.current.clear();
  }, []);

  useEffect(() => {
    pdfGenerationRef.current += 1;
    resetDocument();
  }, [pdfBytes, resetDocument]);

  useEffect(() => {
    return () => {
      resetDocument();
    };
  }, [resetDocument]);

  const getDocument = useCallback(async (): Promise<PDFDocumentProxy | null> => {
    if (!pdfBytes) return null;
    if (docRef.current) return docRef.current;
    if (!docLoadRef.current) {
      docLoadRef.current = (async () => {
        const task = await createPdfLoadingTask(pdfBytes);
        loadingTaskRef.current = task;
        const doc = await task.promise;
        docRef.current = doc;
        return doc;
      })();
    }
    return docLoadRef.current;
  }, [pdfBytes]);

  const applyThumbnail = useCallback((pageId: string, thumbnail: string) => {
    ThumbnailCache.set(pageId, thumbnail);
    onThumbnailReadyRef.current(pageId, thumbnail);
  }, []);

  const requestThumbnail = useCallback(
    (pageId: string) => {
      if (!pdfBytes) return;

      const page = pagesRef.current.find((p) => p.id === pageId);
      const cached = ThumbnailCache.get(pageId);

      if (cached) {
        if (!page?.thumbnail) {
          onThumbnailReadyRef.current(pageId, cached);
        }
        return;
      }

      if (!page || page.thumbnail) return;

      if (!cached) {
        renderedIdsRef.current.delete(pageId);
      }
      if (renderedIdsRef.current.has(pageId)) return;

      renderedIdsRef.current.add(pageId);
      const generation = pdfGenerationRef.current;

      void queueRef.current.enqueue(
        pageId,
        async () => {
          const doc = await getDocument();
          if (!doc) {
            throw new Error("document_unavailable");
          }

          const currentPage = pagesRef.current.find((p) => p.id === pageId);
          const cachedNow = ThumbnailCache.get(pageId);
          if (cachedNow) return cachedNow;
          if (!currentPage || currentPage.thumbnail) {
            return "";
          }

          return renderPageThumbnail(
            doc,
            currentPage.pageIndex,
            undefined,
            (cancel) => {
              queueRef.current.registerCancel(pageId, cancel);
            },
            currentPage.rotation,
          );
        },
      ).then(
        (thumbnail) => {
          if (generation !== pdfGenerationRef.current || !thumbnail) return;
          applyThumbnail(pageId, thumbnail);
        },
        () => {
          if (generation !== pdfGenerationRef.current) return;
          renderedIdsRef.current.delete(pageId);
        },
      );
    },
    [applyThumbnail, getDocument, pdfBytes],
  );

  return { requestThumbnail };
}
