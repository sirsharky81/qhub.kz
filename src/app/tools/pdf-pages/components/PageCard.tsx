"use client";

import { memo, useEffect } from "react";
import { useTranslations } from "next-intl";
import type { PdfPage } from "../types";
import { getPageAspectRatio, getPageMaxHeightClass } from "../lib/pageLayout";
import { ThumbnailCache } from "../lib/thumbnailCache";

interface PageCardProps {
  page: PdfPage;
  displayNumber: number;
  onSelect?: (id: string, event: React.MouseEvent) => void;
  onRotate?: (id: string) => void;
  onRequestThumbnail?: (id: string) => void;
  isVisible?: boolean;
  isDragOverlay?: boolean;
}

function PageCardComponent({
  page,
  displayNumber,
  onSelect,
  onRotate,
  onRequestThumbnail,
  isVisible = true,
  isDragOverlay = false,
}: PageCardProps) {
  const t = useTranslations("toolbar");
  const thumbnailSrc = ThumbnailCache.get(page.id) ?? page.thumbnail;
  const aspectRatio = getPageAspectRatio(page);
  const maxHeightClass = getPageMaxHeightClass(page);

  useEffect(() => {
    if (isVisible && !thumbnailSrc && onRequestThumbnail) {
      onRequestThumbnail(page.id);
    }
  }, [isVisible, page.id, thumbnailSrc, onRequestThumbnail]);

  const interactive = Boolean(onSelect) && !isDragOverlay;

  return (
    <div
      className={`relative w-full select-none ${
        isDragOverlay ? "shadow-2xl ring-2 ring-gray-900/20 rounded-lg rotate-1 scale-105" : ""
      }`}
    >
      <div
        role={interactive ? "button" : undefined}
        tabIndex={interactive ? 0 : undefined}
        onClick={interactive ? (e) => onSelect!(page.id, e) : undefined}
        onKeyDown={
          interactive
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect!(page.id, e as unknown as React.MouseEvent);
                }
              }
            : undefined
        }
        className={`relative rounded-lg border bg-white overflow-hidden transition-shadow text-left w-full ${
          page.selected
            ? "border-gray-900 ring-2 ring-gray-900/25 shadow-md"
            : "border-gray-200 shadow-sm hover:shadow-md hover:border-gray-300"
        } ${interactive ? "cursor-pointer" : ""}`}
        aria-pressed={interactive ? page.selected : undefined}
        aria-label={interactive ? `Page ${displayNumber}` : undefined}
      >
        <div
          className={`w-full bg-gray-50 flex items-center justify-center ${maxHeightClass}`}
          style={{ aspectRatio }}
        >
          {thumbnailSrc ? (
            <img
              src={thumbnailSrc}
              alt=""
              className="w-full h-full object-contain pointer-events-none"
              draggable={false}
            />
          ) : (
            <div
              className="w-full h-full animate-pulse bg-gradient-to-br from-gray-200 via-gray-100 to-gray-200"
              aria-hidden
            />
          )}
        </div>

        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-gray-900/75 backdrop-blur-sm">
          <span className="text-[11px] font-semibold text-white tabular-nums">{displayNumber}</span>
          {page.rotation !== 0 && (
            <span className="text-[10px] text-white/70 ml-1">↻{page.rotation}°</span>
          )}
        </div>

        {page.selected && (
          <div className="absolute top-2 left-2 w-5 h-5 bg-gray-900 rounded-full flex items-center justify-center shadow">
            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
          </div>
        )}

        {page.selected && onRotate && !isDragOverlay && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRotate(page.id);
            }}
            className="absolute top-2 right-2 w-8 h-8 bg-white border border-gray-200 rounded-full flex items-center justify-center shadow-sm hover:bg-gray-50 active:scale-95 transition-transform"
            aria-label={t("rotate")}
            title={t("rotate")}
          >
            <svg
              className="w-4 h-4 text-gray-700"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 4v6h6M20 20v-6h-6M5 19a9 9 0 0114-7.5M19 5a9 9 0 00-14 7.5"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

export const PageCard = memo(PageCardComponent);
