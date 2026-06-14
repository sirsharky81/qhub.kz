"use client";

import { useCallback, useMemo, useState } from "react";
import { analyzeFile } from "@/lib/file-converter/file-analyzer";
import { getSmartActions } from "@/lib/file-converter/smart-actions";
import { processAction, cancelProcessing } from "@/lib/file-converter/processor";
import { downloadBlob } from "@/lib/file-converter/download";
import { mapErrorToUserMessage } from "@/lib/file-converter/errors";
import type { CatalogEntry } from "@/lib/file-converter/conversion-catalog";
import { getCatalogEntry } from "@/lib/file-converter/conversion-catalog";
import {
  acceptForCatalogCategory,
  FILE_ACCEPT,
  isSupportedFile,
  unsupportedFileMessage,
} from "@/lib/file-converter/supported-formats";
import type {
  ActionId,
  FileAnalysis,
  ProcessProgress,
  ProcessResult,
  SmartAction,
  TabId,
} from "@/lib/file-converter/types";
import { ConverterUploadZone } from "./components/UploadZone";
import { ConversionCatalog } from "./components/ConversionCatalog";
import { FileAnalysisPanel } from "./components/FileAnalysisPanel";
import { SmartActionsList } from "./components/SmartActionsList";
import { ProcessingOverlay } from "./components/ProcessingOverlay";
import { ResultPanel } from "./components/ResultPanel";
import { PwaIconGenerator } from "./components/PwaIconGenerator";
import { PrivacyBanner } from "./components/PrivacyBanner";
import { PerformanceWarning, UnsupportedFormatAlert } from "./components/PerformanceWarning";
import { StepIndicator } from "./components/StepIndicator";

type ViewState = "idle" | "analyzed" | "processing" | "done" | "error";

export default function FileConverterClient() {
  const [tab, setTab] = useState<TabId>("converter");
  const [view, setView] = useState<ViewState>("idle");
  const [analysis, setAnalysis] = useState<FileAnalysis | null>(null);
  const [smartActions, setSmartActions] = useState<SmartAction[]>([]);
  const [selectedEntryId, setSelectedEntryId] = useState<string | undefined>();
  const [pendingAction, setPendingAction] = useState<ActionId | null>(null);
  const [pendingLabel, setPendingLabel] = useState<string | null>(null);
  const [pendingInputFormats, setPendingInputFormats] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProcessProgress>({ stage: "", percent: 0, message: "" });
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const step = useMemo((): 0 | 1 | 2 => {
    if (view === "done") return 2;
    if (view === "analyzed" || view === "processing" || view === "error") return 1;
    return 0;
  }, [view]);

  const reset = useCallback(() => {
    setView("idle");
    setAnalysis(null);
    setSmartActions([]);
    setSelectedEntryId(undefined);
    setPendingAction(null);
    setPendingLabel(null);
    setPendingInputFormats(null);
    setResult(null);
    setError(null);
  }, []);

  const uploadAccept = useMemo(() => {
    if (!selectedEntryId) return FILE_ACCEPT;
    const entry = getCatalogEntry(selectedEntryId);
    if (entry?.category) return acceptForCatalogCategory(entry.category);
    return FILE_ACCEPT;
  }, [selectedEntryId]);

  const runAction = useCallback(async (file: File, actionId: ActionId) => {
    setView("processing");
    setError(null);
    setProgress({ stage: "start", percent: 0, message: "Запуск…" });

    try {
      const output = await processAction(file, actionId, setProgress);
      setResult(output);
      setView("done");
    } catch (err) {
      setError(mapErrorToUserMessage(err));
      setView("error");
    }
  }, []);

  const handleFiles = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;

      if (!isSupportedFile(file)) {
        setError(unsupportedFileMessage(file));
        setView("idle");
        setAnalysis(null);
        return;
      }

      setAnalyzing(true);
      setError(null);
      setResult(null);

      try {
        const info = await analyzeFile(file);

        if (info.category === "unknown") {
          setError("Формат не поддерживается. Выберите другой файл.");
          setView("idle");
          setAnalysis(null);
          return;
        }

        setAnalysis(info);
        setSmartActions(getSmartActions(info));
        setView("analyzed");

        if (pendingAction && info.canProcess) {
          await runAction(file, pendingAction);
          setPendingAction(null);
          setPendingLabel(null);
          setPendingInputFormats(null);
        } else if (pendingAction && !info.canProcess) {
          setPendingAction(null);
          setPendingLabel(null);
          setPendingInputFormats(null);
        }
      } catch (err) {
        setError(mapErrorToUserMessage(err));
        setView("idle");
        setAnalysis(null);
      } finally {
        setAnalyzing(false);
      }
    },
    [pendingAction, runAction],
  );

  const handleCatalogSelect = useCallback((actionId: ActionId, entry: CatalogEntry) => {
    setSelectedEntryId(entry.id);
    setPendingAction(actionId);
    setPendingLabel(entry.label);
    setPendingInputFormats(entry.inputFormats);
    setError(null);
    setView("idle");
    setAnalysis(null);
    setResult(null);
  }, []);

  const handleSmartAction = useCallback(
    (action: SmartAction) => {
      if (!analysis?.canProcess) return;
      runAction(analysis.file, action.id);
    },
    [analysis, runAction],
  );

  const handleDownload = useCallback(() => {
    if (result) downloadBlob(result.blob, result.filename);
  }, [result]);

  const uploadHint = pendingLabel
    ? `«${pendingLabel}» — загрузите: ${pendingInputFormats ?? "подходящий файл"}`
    : undefined;

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-white">
      {tab === "converter" && <StepIndicator step={step} />}

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto w-full px-4 py-5 sm:py-6 space-y-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight">
              Smart File Converter
            </h1>
            <p className="text-sm text-gray-500 mt-1 leading-relaxed">
              Загрузите файл — сервис определит тип и предложит лучшее действие.
            </p>
          </div>

          <div className="flex gap-1 p-1 rounded-xl border border-gray-200 bg-gray-50">
            <button
              type="button"
              onClick={() => setTab("converter")}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors touch-manipulation ${
                tab === "converter"
                  ? "bg-white text-gray-900 shadow-sm border border-gray-200"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              Конвертер
            </button>
            <button
              type="button"
              onClick={() => setTab("pwa-icons")}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors touch-manipulation ${
                tab === "pwa-icons"
                  ? "bg-white text-gray-900 shadow-sm border border-gray-200"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              PWA иконки
            </button>
          </div>

          {tab === "pwa-icons" ? (
            <PwaIconGenerator />
          ) : (
            <>
              {view === "idle" && (
                <>
                  <PerformanceWarning />

                  <ConverterUploadZone
                    onFiles={handleFiles}
                    onUnsupported={setError}
                    disabled={analyzing}
                    highlighted={!!pendingAction}
                    hint={uploadHint}
                    accept={uploadAccept}
                  />

                  {error && <UnsupportedFormatAlert message={error} />}

                  {analyzing && (
                    <div className="flex items-center justify-center gap-2 py-3 text-sm text-gray-500">
                      <div className="w-4 h-4 rounded-full border-2 border-gray-200 border-t-gray-900 animate-spin" />
                      Анализ файла…
                    </div>
                  )}

                  {!analyzing && (
                    <ConversionCatalog
                      selectedEntryId={selectedEntryId}
                      onSelectAction={handleCatalogSelect}
                      onOpenPwaTab={() => setTab("pwa-icons")}
                    />
                  )}

                  <PrivacyBanner />

                  <div className="flex flex-wrap justify-center gap-2 pt-1 text-[11px] text-gray-400">
                    <span className="px-2 py-1 rounded-full border border-gray-100 bg-gray-50">
                      WebAssembly
                    </span>
                    <span className="px-2 py-1 rounded-full border border-gray-100 bg-gray-50">
                      Без лимитов
                    </span>
                    <span className="px-2 py-1 rounded-full border border-gray-100 bg-gray-50">
                      Без регистрации
                    </span>
                  </div>
                </>
              )}

              {(view === "analyzed" || view === "error") && analysis && (
                <div className="space-y-4">
                  <PerformanceWarning />
                  <FileAnalysisPanel analysis={analysis} />

                  {view === "analyzed" && (
                    <SmartActionsList
                      actions={smartActions}
                      onSelect={handleSmartAction}
                      disabled={!analysis.canProcess}
                    />
                  )}

                  {error && (
                    <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
                      {error}
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={reset}
                    className="w-full py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors touch-manipulation"
                  >
                    ← Другой файл
                  </button>
                </div>
              )}

              {view === "done" && result && (
                <div className="space-y-4">
                  {analysis && <FileAnalysisPanel analysis={analysis} />}
                  <ResultPanel
                    filename={result.filename}
                    size={result.size}
                    onDownload={handleDownload}
                    onReset={reset}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {view === "processing" && (
        <ProcessingOverlay
          progress={progress}
          onCancel={() => {
            cancelProcessing();
            setView(analysis ? "analyzed" : "idle");
          }}
        />
      )}
    </div>
  );
}
