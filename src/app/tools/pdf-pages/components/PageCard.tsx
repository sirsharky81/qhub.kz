"use client";

import { memo, useEffect } from "react";
import type { PdfPage } from "../types";

interface PageCardProps {
  page: PdfPage;
  displayNumber: number;
  onSelect: (id: string, event: React.MouseEvent) => void;
  onRequestThumbnail: (id: string) => void;
  isVisible: boolean;
}

function PageCardComponent({
  page,
  displayNumber,
  onSelect,
  onRequestThumbnail,
  isVisible,
}: PageCardProps) {
  useEffect(() => {
    if (isVisible && !page.thumbnail) {
      onRequestThumbnail(page.id);
    }
  }, [isVisible, page.id, page.thumbnail, onRequestThumbnail]);

  return (
    <button
      type="button"
      onClick={(e) => onSelect(page.id, e)}
      className={`relative group rounded-xl border-2 overflow-hidden transition-all text-left w-full ${
        page.selected
          ? "border-gray-900 ring-2 ring-gray-900/20"
          : "border-gray-200 hover:border-gray-400"
      }`}
      aria-pressed={page.selected}
      aria-label={`Page ${displayNumber}`}
    >
      <div className="aspect-[3/4] bg-gray-100 flex items-center justify-center">
        {page.thumbnail ? (
          <img
            src={page.thumbnail}
            alt=""
            className="w-full h-full object-contain"
            style={{ transform: `rotate(${page.rotation}deg)` }}
            draggable={false}
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-gray-400">
            <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
            <span className="text-[10px]">…</span>
          </div>
        )}
      </div>

      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5">
        <span className="text-xs font-medium text-white">{displayNumber}</span>
        {page.rotation !== 0 && (
          <span className="text-[10px] text-white/70 ml-1">↻{page.rotation}°</span>
        )}
      </div>

      {page.selected && (
        <div className="absolute top-1.5 right-1.5 w-5 h-5 bg-gray-900 rounded-full flex items-center justify-center">
          <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      )}
    </button>
  );
}

export const PageCard = memo(PageCardComponent);
