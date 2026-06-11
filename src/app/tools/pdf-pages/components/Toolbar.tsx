"use client";

import { useTranslations } from "next-intl";
import type { PdfActionMode } from "../types";
import { RangeInput } from "./RangeInput";

interface ToolbarProps {
  selectedCount: number;
  totalPages: number;
  mode: PdfActionMode;
  onModeChange: (mode: PdfActionMode) => void;
  onDelete: () => void;
  onDeleteRange: (range: string) => void;
  onRotate: () => void;
  onExtract: () => void;
  onAddPdf: () => void;
  onSplit: (mode: "each" | "ranges", range?: string) => void;
  onDownload: () => void;
  onReset: () => void;
  onMovePrev?: () => void;
  onMoveNext?: () => void;
  canMovePrev?: boolean;
  canMoveNext?: boolean;
  rangeValue: string;
  onRangeChange: (value: string) => void;
  rangeError: string | null;
  fileName: string;
}

export function Toolbar({
  selectedCount,
  totalPages,
  mode,
  onModeChange,
  onDelete,
  onDeleteRange,
  onRotate,
  onExtract,
  onAddPdf,
  onSplit,
  onDownload,
  onReset,
  onMovePrev,
  onMoveNext,
  canMovePrev = false,
  canMoveNext = false,
  rangeValue,
  onRangeChange,
  rangeError,
  fileName,
}: ToolbarProps) {
  const t = useTranslations("toolbar");

  const btnClass =
    "px-3 py-2 rounded-xl text-xs sm:text-sm font-medium border border-gray-200 text-gray-700 hover:border-gray-400 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
  const btnPrimary =
    "px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-gray-900 hover:bg-gray-700 text-white transition-colors disabled:opacity-40";
  const btnAccent =
    "px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold border border-gray-900 text-gray-900 hover:bg-gray-50 transition-colors";

  return (
    <div className="flex-shrink-0 border-b border-gray-200 bg-white">
      <div className="px-3 sm:px-4 py-2 sm:py-3 space-y-2">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <span className="text-[11px] sm:text-xs text-gray-500 truncate">
            {fileName} · {totalPages} {t("pages")}
            {selectedCount > 0 && ` · ${t("selected", { count: selectedCount })}`}
          </span>
          <button type="button" className={btnPrimary} onClick={onDownload}>
            {t("download")}
          </button>
        </div>

        {selectedCount > 0 && (
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            <button type="button" className={btnClass} onClick={onDelete}>
              {t("delete")}
            </button>
            <button type="button" className={btnAccent} onClick={onRotate}>
              ↻ {t("rotate")}
            </button>
            <button type="button" className={btnClass} onClick={onExtract}>
              {t("extract")}
            </button>
            {selectedCount === 1 && (
              <>
                <button
                  type="button"
                  className={btnClass}
                  disabled={!canMovePrev}
                  onClick={onMovePrev}
                >
                  ←
                </button>
                <button
                  type="button"
                  className={btnClass}
                  disabled={!canMoveNext}
                  onClick={onMoveNext}
                >
                  →
                </button>
              </>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-1.5 sm:gap-2">
          <button type="button" className={btnAccent} onClick={onAddPdf}>
            + {t("addPdf")}
          </button>
          <button
            type="button"
            className={mode === "split" ? btnPrimary : btnClass}
            onClick={() => onModeChange(mode === "split" ? null : "split")}
          >
            {t("split")}
          </button>
          <button type="button" className={btnClass} onClick={onReset}>
            {t("reset")}
          </button>
        </div>
      </div>

      {mode === "split" && (
        <div className="px-3 sm:px-4 pb-3 space-y-3 border-t border-gray-100 pt-3">
          <p className="text-xs text-gray-500">{t("splitHint")}</p>
          <button type="button" className={btnClass} onClick={() => onSplit("each")}>
            {t("splitEach")}
          </button>
          <RangeInput
            value={rangeValue}
            onChange={onRangeChange}
            error={rangeError}
            label={t("splitByRange")}
          />
          <button
            type="button"
            className={btnPrimary}
            disabled={!!rangeError || !rangeValue.trim()}
            onClick={() => onSplit("ranges", rangeValue)}
          >
            {t("splitApply")}
          </button>
        </div>
      )}

      <div className="px-3 sm:px-4 pb-3 sm:hidden border-t border-gray-100 pt-2">
        <RangeInput
          value={rangeValue}
          onChange={onRangeChange}
          error={rangeError}
          label={t("deleteRange")}
        />
        <button
          type="button"
          className={`${btnClass} mt-2 w-full`}
          disabled={!!rangeError || !rangeValue.trim()}
          onClick={() => onDeleteRange(rangeValue)}
        >
          {t("deleteRangeApply")}
        </button>
      </div>
    </div>
  );
}
