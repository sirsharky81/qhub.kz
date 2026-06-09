"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import type { PdfActionMode } from "./types";
import { usePdfDocument } from "./hooks/usePdfDocument";
import { usePdfActions } from "./hooks/usePdfActions";
import { useThumbnails } from "./hooks/useThumbnails";
import { validateRanges } from "./lib/rangeParser";
import { UploadZone } from "./components/UploadZone";
import { PageGrid, useGridColumns } from "./components/PageGrid";
import { Toolbar } from "./components/Toolbar";
import { ProcessingOverlay } from "./components/ProcessingOverlay";
import { FaqSection } from "./components/FaqSection";
import { SeoContent } from "./components/SeoContent";
import ruMessages from "../../../../messages/ru.json";
import kkMessages from "../../../../messages/kk.json";
import enMessages from "../../../../messages/en.json";

type Locale = "ru" | "kk" | "en";

const MESSAGES: Record<Locale, typeof ruMessages> = {
  ru: ruMessages,
  kk: kkMessages,
  en: enMessages,
};

const LOCALE_OPTIONS: { id: Locale; label: string }[] = [
  { id: "ru", label: "Рус" },
  { id: "kk", label: "Қаз" },
  { id: "en", label: "Eng" },
];

interface PdfPagesClientProps {
  initialAction?: PdfActionMode;
}

function PdfPagesInner({ initialAction }: PdfPagesClientProps) {
  const t = useTranslations("errors");
  const tConfirm = useTranslations("confirm");
  const router = useRouter();
  const searchParams = useSearchParams();

  const {
    pages,
    originalBytes,
    isLoading,
    isProcessing,
    error,
    loadPdf,
    reset,
    setError,
    setPages,
    setOriginalBytes,
    setIsProcessing,
    updatePage,
    updatePages,
  } = usePdfDocument();

  const actions = usePdfActions({
    pages,
    originalBytes,
    setPages,
    setOriginalBytes,
    setIsProcessing,
    setError,
    updatePages,
  });

  const [localMode, setLocalMode] = useState<PdfActionMode>(initialAction ?? null);
  const [rangeValue, setRangeValue] = useState("");
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("document.pdf");
  const lastSelectedRef = useRef<string | null>(null);

  const mergeInputRef = useRef<HTMLInputElement>(null);
  const addInputRef = useRef<HTMLInputElement>(null);

  const columns = useGridColumns();
  const selectedIds = useMemo(
    () => new Set(pages.filter((p) => p.selected).map((p) => p.id)),
    [pages],
  );
  const selectedCount = selectedIds.size;

  const urlAction = searchParams.get("action");
  const mode: PdfActionMode =
    urlAction === "merge" || urlAction === "split" || urlAction === "extract"
      ? urlAction
      : localMode;

  const { requestThumbnail } = useThumbnails({
    pdfBytes: originalBytes,
    pages,
    onThumbnailReady: useCallback(
      (pageId: string, thumbnail: string) => {
        updatePage(pageId, { thumbnail });
      },
      [updatePage],
    ),
  });

  const updateUrlMode = useCallback(
    (newMode: PdfActionMode) => {
      const params = new URLSearchParams(searchParams.toString());
      if (newMode) {
        params.set("action", newMode);
      } else {
        params.delete("action");
      }
      const query = params.toString();
      router.replace(query ? `?${query}` : "/tools/pdf-pages", { scroll: false });
    },
    [router, searchParams],
  );

  const handleModeChange = useCallback(
    (newMode: PdfActionMode) => {
      setLocalMode(newMode);
      updateUrlMode(newMode);
    },
    [updateUrlMode],
  );

  const handleFileSelect = useCallback(
    async (files: FileList | File[]) => {
      const file = Array.from(files)[0];
      if (!file) return;
      setFileName(file.name);
      await loadPdf(file);
    },
    [loadPdf],
  );

  const handleSelect = useCallback(
    (id: string, event: React.MouseEvent) => {
      const pageIndex = pages.findIndex((p) => p.id === id);
      if (pageIndex === -1) return;

      if (event.shiftKey && lastSelectedRef.current) {
        const lastIndex = pages.findIndex((p) => p.id === lastSelectedRef.current);
        if (lastIndex !== -1) {
          const start = Math.min(lastIndex, pageIndex);
          const end = Math.max(lastIndex, pageIndex);
          updatePages((prev) =>
            prev.map((p, i) => ({
              ...p,
              selected: i >= start && i <= end ? true : p.selected,
            })),
          );
        }
      } else if (event.ctrlKey || event.metaKey) {
        updatePage(id, { selected: !pages[pageIndex].selected });
        lastSelectedRef.current = id;
      } else {
        updatePages((prev) =>
          prev.map((p) => ({ ...p, selected: p.id === id })),
        );
        lastSelectedRef.current = id;
      }
    },
    [pages, updatePage, updatePages],
  );

  const handleDelete = useCallback(async () => {
    if (selectedCount === 0) return;
    if (selectedCount >= 3) {
      const confirmed = window.confirm(tConfirm("deleteMany", { count: selectedCount }));
      if (!confirmed) return;
    }
    await actions.deletePages(selectedIds);
  }, [actions, selectedCount, selectedIds, tConfirm]);

  const handleDeleteRange = useCallback(
    async (range: string) => {
      const err = validateRanges(range, pages.length);
      if (err) {
        setRangeError(err);
        return;
      }
      const { parsePageRanges } = await import("./lib/rangeParser");
      const pageNumbers = parsePageRanges(range, pages.length);
      const validIds = new Set(
        pageNumbers.map((n) => pages[n - 1]?.id).filter((id): id is string => Boolean(id)),
      );
      if (validIds.size >= 3) {
        const confirmed = window.confirm(tConfirm("deleteMany", { count: validIds.size }));
        if (!confirmed) return;
      }
      await actions.deletePages(validIds);
      setRangeValue("");
    },
    [actions, pages, tConfirm],
  );

  const handleReset = useCallback(() => {
    const confirmed = window.confirm(tConfirm("reset"));
    if (!confirmed) return;
    reset();
    setLocalMode(null);
    setRangeValue("");
    setFileName("document.pdf");
    updateUrlMode(null);
  }, [reset, tConfirm, updateUrlMode]);

  const handleRangeChange = useCallback(
    (value: string) => {
      setRangeValue(value);
      if (!value.trim()) {
        setRangeError(null);
        return;
      }
      setRangeError(validateRanges(value, pages.length));
    },
    [pages.length],
  );

  const handleMergeSelect = useCallback(() => {
    mergeInputRef.current?.click();
  }, []);

  const handleMergeFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      await actions.mergeFiles(Array.from(files));
      setLocalMode(null);
      updateUrlMode(null);
    },
    [actions, updateUrlMode],
  );

  const handleAddPages = useCallback(() => {
    addInputRef.current?.click();
  }, []);

  const handleAddFiles = useCallback(
    async (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;
      await actions.addPdfFile(file);
    },
    [actions],
  );

  const errorMessage = error ? t(error) : null;

  return (
    <div className="flex flex-col min-h-[calc(100vh-2.75rem)]">
      <input
        ref={mergeInputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="hidden"
        onChange={(e) => void handleMergeFiles(e.target.files)}
      />
      <input
        ref={addInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => void handleAddFiles(e.target.files)}
      />

      {pages.length === 0 ? (
        <>
          <UploadZone onFileSelect={handleFileSelect} disabled={isLoading} />
          <FaqSection />
          <SeoContent />
        </>
      ) : (
        <>
          <div className="hidden sm:block">
            <Toolbar
              selectedCount={selectedCount}
              totalPages={pages.length}
              mode={mode}
              onModeChange={handleModeChange}
              onDelete={() => void handleDelete()}
              onDeleteRange={(range) => void handleDeleteRange(range)}
              onRotate={() => actions.rotatePages(selectedIds)}
              onExtract={() => void actions.extractSelected(selectedIds, fileName)}
              onMerge={handleMergeSelect}
              onSplit={(splitMode, range) =>
                void actions.splitDocument(fileName, splitMode, range)
              }
              onDownload={() => void actions.downloadDocument(fileName)}
              onReset={handleReset}
              onAddPages={handleAddPages}
              rangeValue={rangeValue}
              onRangeChange={handleRangeChange}
              rangeError={rangeError}
              fileName={fileName}
            />
          </div>

          {errorMessage && (
            <div className="mx-4 mt-3 px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {errorMessage}
            </div>
          )}

          <PageGrid
            pages={pages}
            onReorder={(reordered) => void actions.reorderPages(reordered)}
            onSelect={handleSelect}
            onRequestThumbnail={requestThumbnail}
            columns={columns}
          />

          <div className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-gray-200 shadow-lg">
            <Toolbar
              selectedCount={selectedCount}
              totalPages={pages.length}
              mode={mode}
              onModeChange={handleModeChange}
              onDelete={() => void handleDelete()}
              onDeleteRange={(range) => void handleDeleteRange(range)}
              onRotate={() => actions.rotatePages(selectedIds)}
              onExtract={() => void actions.extractSelected(selectedIds, fileName)}
              onMerge={handleMergeSelect}
              onSplit={(splitMode, range) =>
                void actions.splitDocument(fileName, splitMode, range)
              }
              onDownload={() => void actions.downloadDocument(fileName)}
              onReset={handleReset}
              onAddPages={handleAddPages}
              rangeValue={rangeValue}
              onRangeChange={handleRangeChange}
              rangeError={rangeError}
              fileName={fileName}
            />
          </div>
        </>
      )}

      <ProcessingOverlay visible={isLoading || isProcessing} />
    </div>
  );
}

export default function PdfPagesClient({ initialAction }: PdfPagesClientProps) {
  const [locale, setLocale] = useState<Locale>("ru");

  return (
    <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]}>
      <div className="flex justify-end px-4 pt-2 gap-1 print:hidden">
        {LOCALE_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setLocale(opt.id)}
            className={`px-2 py-0.5 text-[11px] font-semibold rounded-md transition-colors ${
              locale === opt.id
                ? "bg-gray-900 text-white"
                : "text-gray-500 hover:text-gray-800"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <PdfPagesInner initialAction={initialAction} />
    </NextIntlClientProvider>
  );
}
