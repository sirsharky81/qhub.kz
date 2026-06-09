"use client";

import { useCallback, useEffect, useRef } from "react";
import type { PdfPage } from "../types";
import { renderThumbnail } from "../lib/pdfOperations";

interface UseThumbnailsOptions {
  pdfBytes: Uint8Array | null;
  pages: PdfPage[];
  onThumbnailReady: (pageId: string, thumbnail: string) => void;
}

/**
 * Lazily generates thumbnails for visible pages as they enter the viewport.
 */
export function useThumbnails({
  pdfBytes,
  pages,
  onThumbnailReady,
}: UseThumbnailsOptions) {
  const queueRef = useRef<Set<string>>(new Set());
  const activeRef = useRef(false);
  const onThumbnailReadyRef = useRef(onThumbnailReady);

  useEffect(() => {
    onThumbnailReadyRef.current = onThumbnailReady;
  }, [onThumbnailReady]);

  const requestThumbnail = useCallback(
    (pageId: string) => {
      if (!pdfBytes) return;
      const page = pages.find((p) => p.id === pageId);
      if (!page || page.thumbnail) return;
      queueRef.current.add(pageId);
    },
    [pdfBytes, pages],
  );

  useEffect(() => {
    if (!pdfBytes || queueRef.current.size === 0 || activeRef.current) return;

    const processQueue = async () => {
      activeRef.current = true;

      while (queueRef.current.size > 0) {
        const pageId = queueRef.current.values().next().value;
        if (!pageId) break;
        queueRef.current.delete(pageId);

        const page = pages.find((p) => p.id === pageId);
        if (!page || page.thumbnail) continue;

        try {
          const thumbnail = await renderThumbnail(pdfBytes, page.pageIndex);
          onThumbnailReadyRef.current(pageId, thumbnail);
        } catch {
          // Thumbnail failure is non-fatal
        }
      }

      activeRef.current = false;
    };

    void processQueue();
  }, [pdfBytes, pages]);

  return { requestThumbnail };
}
