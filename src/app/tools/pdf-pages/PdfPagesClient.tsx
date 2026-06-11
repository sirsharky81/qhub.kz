"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { arrayMove } from "@dnd-kit/sortable";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import type { PdfActionMode } from "./types";
import { usePdfDocument } from "./hooks/useDocumentState";
import { usePdfActions } from "./hooks/usePdfActions";
import { useThumbnails } from "./hooks/useThumbnails";
import { validateRanges } from "./lib/rangeParser";
import { SharedUploadZone as UploadZone } from "../_pdf-shared/UploadZone";
import { PageGrid, useGridColumns } from "./components/PageGrid";
import { Toolbar } from "./components/Toolbar";
import { ProcessingOverlay } from "./components/ProcessingOverlay";
import { FaqSection } from "./components/FaqSection";
import { SeoContent } from "./components/SeoContent";
import ruMessages from "../../../../messages/ru.json";
import kkMessages from "../../../../messages/kk.json";
import enMessages from "../../../../messages/en.json";

type Locale = "ru" | "kk" | "en";

const TOOLBAR_FALLBACKS: Record<
  Locale,
  { reorderHint: string; movePrev: string; moveNext: string }
> = {
  ru: {
    reorderHint: "Перетащите для сортировки. Клик — выбор. Кнопка ↻ на карточке — поворот.",
    movePrev: "Назад",
    moveNext: "Вперёд",
  },
  kk: {
    reorderHint: "Ретті өзгерту — сүйреңіз. Таңдау — басып. ↻ — бұру.",
    movePrev: "Артқа",
    moveNext: "Алға",
  },
  en: {
    reorderHint: "Drag to reorder. Click to select. ↻ on card rotates.",
    movePrev: "Back",
    moveNext: "Forward",
  },
};

function withToolbarFallbacks(messages: typeof ruMessages, locale: Locale): typeof ruMessages {
  const fb = TOOLBAR_FALLBACKS[locale];
  return {
    ...messages,
    toolbar: {
      ...messages.toolbar,
      reorderHint: messages.toolbar.reorderHint ?? fb.reorderHint,
      movePrev: messages.toolbar.movePrev ?? fb.movePrev,
      moveNext: messages.toolbar.moveNext ?? fb.moveNext,
    },
  };
}

const MESSAGES: Record<Locale, typeof ruMessages> = {
  ru: withToolbarFallbacks(ruMessages, "ru"),
  kk: withToolbarFallbacks(kkMessages, "kk"),
  en: withToolbarFallbacks(enMessages, "en"),
};

const LOCALE_OPTIONS: { id: Locale; label: string }[] = [
  { id: "ru", label: "Рус" },
  { id: "kk", label: "Қаз" },
  { id: "en", label: "Eng" },
];

interface PdfPagesClientProps {
  initialAction?: PdfActionMode | "merge";
}

function PdfPagesInner({ initialAction, reorderHint }: PdfPagesClientProps & { reorderHint: string }) {
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

  const [localMode, setLocalMode] = useState<PdfActionMode>(
    initialAction === "split" || initialAction === "extract" ? initialAction : null,
  );
  const [rangeValue, setRangeValue] = useState("");
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("document.pdf");
  const lastSelectedRef = useRef<string | null>(null);

  const addPdfInputRef = useRef<HTMLInputElement>(null);

  const columns = useGridColumns();
  const selectedIds = useMemo(
    () => new Set(pages.filter((p) => p.selected).map((p) => p.id)),
    [pages],
  );
  const selectedCount = selectedIds.size;

  const selectedPageIndex = useMemo(() => {
    if (selectedCount !== 1) return -1;
    return pages.findIndex((p) => p.selected);
  }, [pages, selectedCount]);

  const handleMoveSelected = useCallback(
    (direction: "prev" | "next") => {
      if (selectedPageIndex < 0) return;
      const newIndex =
        direction === "prev" ? selectedPageIndex - 1 : selectedPageIndex + 1;
      if (newIndex < 0 || newIndex >= pages.length) return;
      actions.reorderPages(arrayMove(pages, selectedPageIndex, newIndex));
    },
    [actions, pages, selectedPageIndex],
  );

  const urlAction = searchParams.get("action");
  const mode: PdfActionMode =
    urlAction === "split" || urlAction === "extract" ? urlAction : localMode;

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
      const list = Array.from(files);
      if (list.length === 0) return;

      if (list.length === 1) {
        setFileName(list[0].name);
        await loadPdf(list[0]);
        return;
      }

      setFileName(`${list[0].name.replace(/\.pdf$/i, "")}_combined.pdf`);
      await actions.importPdfFiles(list);
    },
    [actions, loadPdf],
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

  const handleAddPdf = useCallback(() => {
    addPdfInputRef.current?.click();
  }, []);

  const handleAddPdfFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      await actions.appendPdfFiles(Array.from(files));
      if (addPdfInputRef.current) {
        addPdfInputRef.current.value = "";
      }
    },
    [actions],
  );

  const handleRotatePage = useCallback(
    (pageId: string) => {
      actions.rotatePages(new Set([pageId]));
    },
    [actions],
  );

  useEffect(() => {
    if (initialAction === "merge" && pages.length > 0) {
      addPdfInputRef.current?.click();
    }
  }, [initialAction, pages.length]);

  const errorMessage = error ? t(error) : null;

  return (
    <div className="flex flex-col h-[calc(100vh-2.75rem)] overflow-hidden">
      <input
        ref={addPdfInputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="hidden"
        onChange={(e) => void handleAddPdfFiles(e.target.files)}
      />

      {pages.length === 0 ? (
        <>
          <UploadZone onFileSelect={handleFileSelect} disabled={isLoading} multiple />
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
              onAddPdf={handleAddPdf}
              onSplit={(splitMode, range) =>
                void actions.splitDocument(fileName, splitMode, range)
              }
              onDownload={() => void actions.downloadDocument(fileName)}
              onReset={handleReset}
              onMovePrev={() => handleMoveSelected("prev")}
              onMoveNext={() => handleMoveSelected("next")}
              canMovePrev={selectedPageIndex > 0}
              canMoveNext={selectedPageIndex >= 0 && selectedPageIndex < pages.length - 1}
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
            onReorder={(reordered) => actions.reorderPages(reordered)}
            onSelect={handleSelect}
            onRotate={handleRotatePage}
            onRequestThumbnail={requestThumbnail}
            columns={columns}
            reorderHint={reorderHint}
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
              onAddPdf={handleAddPdf}
              onSplit={(splitMode, range) =>
                void actions.splitDocument(fileName, splitMode, range)
              }
              onDownload={() => void actions.downloadDocument(fileName)}
              onReset={handleReset}
              onMovePrev={() => handleMoveSelected("prev")}
              onMoveNext={() => handleMoveSelected("next")}
              canMovePrev={selectedPageIndex > 0}
              canMoveNext={selectedPageIndex >= 0 && selectedPageIndex < pages.length - 1}
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
  const reorderHint = TOOLBAR_FALLBACKS[locale].reorderHint;

  return (
    <NextIntlClientProvider
      locale={locale}
      messages={MESSAGES[locale]}
      onError={(error) => {
        if (error.code === "MISSING_MESSAGE") return;
        console.error(error);
      }}
      getMessageFallback={({ namespace, key }) => {
        if (namespace === "toolbar") {
          const fb = TOOLBAR_FALLBACKS[locale];
          if (key === "reorderHint") return fb.reorderHint;
          if (key === "movePrev") return fb.movePrev;
          if (key === "moveNext") return fb.moveNext;
        }
        return key;
      }}
    >
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
      <PdfPagesInner initialAction={initialAction} reorderHint={reorderHint} />
    </NextIntlClientProvider>
  );
}
