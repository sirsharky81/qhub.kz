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
  onMerge: () => void;
  onSplit: (mode: "each" | "ranges", range?: string) => void;
  onDownload: () => void;
  onReset: () => void;
  onAddPages: () => void;
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
  onMerge,
  onSplit,
  onDownload,
  onReset,
  onAddPages,
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

  return (
    <div className="flex-shrink-0 border-b border-gray-200 bg-white">
      <div className="px-4 py-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-500 mr-1 hidden sm:inline">
          {fileName} · {totalPages} {t("pages")}
          {selectedCount > 0 && ` · ${t("selected", { count: selectedCount })}`}
        </span>

        <div className="flex flex-wrap gap-2 sm:ml-auto">
          {selectedCount > 0 && (
            <>
              <button type="button" className={btnClass} onClick={onDelete}>
                {t("delete")}
              </button>
              <button type="button" className={btnClass} onClick={onRotate}>
                {t("rotate")}
              </button>
              <button type="button" className={btnPrimary} onClick={onExtract}>
                {t("extract")}
              </button>
            </>
          )}

          <button type="button" className={btnClass} onClick={onAddPages}>
            {t("addPages")}
          </button>
          <button
            type="button"
            className={mode === "merge" ? btnPrimary : btnClass}
            onClick={() => onModeChange(mode === "merge" ? null : "merge")}
          >
            {t("merge")}
          </button>
          <button
            type="button"
            className={mode === "split" ? btnPrimary : btnClass}
            onClick={() => onModeChange(mode === "split" ? null : "split")}
          >
            {t("split")}
          </button>
          <button type="button" className={btnPrimary} onClick={onDownload}>
            {t("download")}
          </button>
          <button type="button" className={btnClass} onClick={onReset}>
            {t("reset")}
          </button>
        </div>
      </div>

      {mode === "split" && (
        <div className="px-4 pb-3 space-y-3 border-t border-gray-100 pt-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={btnClass}
              onClick={() => onSplit("each")}
            >
              {t("splitEach")}
            </button>
          </div>
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

      {mode === "merge" && (
        <div className="px-4 pb-3 border-t border-gray-100 pt-3">
          <p className="text-sm text-gray-600">{t("mergeHint")}</p>
          <button type="button" className={`${btnPrimary} mt-2`} onClick={onMerge}>
            {t("mergeSelect")}
          </button>
        </div>
      )}

      {mode === "extract" && selectedCount === 0 && (
        <div className="px-4 pb-3 border-t border-gray-100 pt-3">
          <p className="text-sm text-gray-600">{t("extractHint")}</p>
        </div>
      )}

      <div className="px-4 pb-3 sm:hidden">
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
