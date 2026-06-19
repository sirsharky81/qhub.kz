"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  analyzeBatchQuality,
  assignInvNumbersToBatch,
  addInvNumberColumn,
  clearActiveBatch,
  collectAllCellValues,
  detectInvNumberPattern,
  downloadBatchCsv,
  downloadBatchXlsx,
  hasInvNumberColumn,
  isAsciiBarcodeSafe,
  markRowsGenerated,
  parseQhubInventoryFile,
  parseSpreadsheetToBatch,
  previewInvNumbers,
  rowToLabelData,
  saveBatch,
  loadActiveBatch,
  slugBatchFilename,
  type BatchRow,
  type InventoryLabelBatch,
  MAX_PDF_BATCH,
} from "@/lib/qr-generator/inventory-batch";
import {
  buildLabelCodeImages,
  generateInventoryBatchPdf,
  generateSingleInventoryLabelPdf,
} from "@/lib/qr-generator/labelPrint";
import { DEFAULT_LABEL_OPTIONS, type LabelOptions } from "@/lib/qr-generator/types";
import { useQrTranslations } from "@/lib/qr-generator/i18n";
import { UploadInstructions } from "../components/inventory-batch/UploadInstructions";
import { BatchQualityPanel } from "../components/inventory-batch/BatchQualityPanel";
import { GenerateInvNumbersModal } from "../components/inventory-batch/GenerateInvNumbersModal";
import { BatchTablePanel, SingleLabelModal } from "../components/inventory-batch/BatchTablePanel";

function mapUploadError(code: string, t: (k: string) => string): string {
  switch (code) {
    case "file_too_large":
      return t("batch.fileTooLarge");
    case "too_many_rows":
      return t("batch.tooManyRows");
    case "empty_file":
      return t("batch.emptyFile");
    case "unsupported_format":
      return t("batch.unsupportedFormat");
    case "invalid_qhub_file":
      return t("batch.invalidQhub");
    default:
      return code;
  }
}

async function buildPdfAssets(
  rows: BatchRow[],
  batch: InventoryLabelBatch,
  codeType: LabelOptions["codeType"],
) {
  const labels: { identifier: string; title?: string }[] = [];
  const qrDataUrls: (string | null)[] = [];
  const barcodeDataUrls: (string | null)[] = [];

  for (const row of rows) {
    const data = rowToLabelData(batch, row);
    if (!data.identifier) continue;
    labels.push({ identifier: data.identifier, title: data.title });
    const images = await buildLabelCodeImages(data.identifier, codeType);
    qrDataUrls.push(images.qrDataUrl);
    barcodeDataUrls.push(images.barcodeDataUrl);
  }

  return { labels, qrDataUrls, barcodeDataUrls };
}

interface InventoryBatchClientProps {
  embedded?: boolean;
}

export default function InventoryBatchClient({ embedded }: InventoryBatchClientProps = {}) {
  const { t } = useQrTranslations();
  const [batch, setBatch] = useState<InventoryLabelBatch | null>(null);
  const [labelOptions, setLabelOptions] = useState<LabelOptions>({
    ...DEFAULT_LABEL_OPTIONS,
    labelFormat: "58x40",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invModalOpen, setInvModalOpen] = useState(false);
  const [invPreview, setInvPreview] = useState<string[]>([]);
  const [singleRow, setSingleRow] = useState<BatchRow | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingSource, setPendingSource] = useState<"upload" | "qhub" | null>(null);
  const [replaceMode, setReplaceMode] = useState(false);

  const persist = useCallback(async (next: InventoryLabelBatch | null) => {
    setBatch(next);
    if (next) await saveBatch(next);
  }, []);

  useEffect(() => {
    void loadActiveBatch().then(setBatch);
  }, []);

  const quality = useMemo(() => {
    if (!batch) return null;
    return analyzeBatchQuality(batch.rows, batch.idColumnId, batch.fieldMapping.itemName);
  }, [batch]);

  async function ingestBatch(next: InventoryLabelBatch) {
    setError(null);
    await persist(next);
  }

  async function handleUploadFile(file: File) {
    if (batch?.rows.length && !replaceMode) {
      setPendingFile(file);
      setPendingSource("upload");
      return;
    }
    setReplaceMode(false);
    try {
      setBusy(true);
      await ingestBatch(await parseSpreadsheetToBatch(file));
    } catch (e) {
      setError(mapUploadError(e instanceof Error ? e.message : "error", t));
    } finally {
      setBusy(false);
    }
  }

  async function handleImportQhub(file: File) {
    if (batch?.rows.length && !replaceMode) {
      setPendingFile(file);
      setPendingSource("qhub");
      return;
    }
    setReplaceMode(false);
    try {
      setBusy(true);
      await ingestBatch(await parseQhubInventoryFile(file));
    } catch (e) {
      setError(mapUploadError(e instanceof Error ? e.message : "error", t));
    } finally {
      setBusy(false);
    }
  }

  async function confirmReload() {
    if (!pendingFile || !pendingSource) return;
    const file = pendingFile;
    const source = pendingSource;
    setPendingFile(null);
    setPendingSource(null);
    try {
      setBusy(true);
      const next =
        source === "qhub" ? await parseQhubInventoryFile(file) : await parseSpreadsheetToBatch(file);
      await ingestBatch(next);
    } catch (e) {
      setError(mapUploadError(e instanceof Error ? e.message : "error", t));
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteBase() {
    if (!window.confirm(t("batch.confirmDelete"))) return;
    await clearActiveBatch();
    setBatch(null);
    setError(null);
  }

  function needsInvNumberModal(b: InventoryLabelBatch): boolean {
    if (!hasInvNumberColumn(b.columns, b.fieldMapping)) return true;
    const q = analyzeBatchQuality(b.rows, b.idColumnId, b.fieldMapping.itemName);
    return q.emptyIdentifiers > 0;
  }

  function openInvModal(b: InventoryLabelBatch) {
    const pattern = detectInvNumberPattern(collectAllCellValues(b.rows));
    setInvPreview(previewInvNumbers(5, pattern));
    setInvModalOpen(true);
  }

  async function finishQualityStep(b: InventoryLabelBatch) {
    const next: InventoryLabelBatch = {
      ...b,
      mappingConfirmed: true,
      step: "workspace",
      updatedAt: Date.now(),
    };
    await persist(next);
  }

  function handleContinueQuality() {
    if (!batch) return;
    if (needsInvNumberModal(batch)) {
      openInvModal(batch);
      return;
    }
    void finishQualityStep(batch);
  }

  async function handleCreateInvNumbers() {
    if (!batch) return;
    setInvModalOpen(false);
    const { columns, invColumnId } = addInvNumberColumn(batch.columns);
    const pattern = detectInvNumberPattern(collectAllCellValues(batch.rows));
    const assigned = assignInvNumbersToBatch(batch.rows, columns, invColumnId, pattern);
    const next: InventoryLabelBatch = {
      ...batch,
      columns: assigned.columns,
      rows: assigned.rows,
      idColumnId: invColumnId,
      fieldMapping: { ...batch.fieldMapping, inventoryNumber: invColumnId },
    };
    await finishQualityStep(next);
  }

  async function handleSkipInvNumbers() {
    setInvModalOpen(false);
    if (batch) await finishQualityStep(batch);
  }

  async function handlePrintFiltered(rows: BatchRow[]) {
    if (!batch) return;
    const printable = rows.filter((r) => rowToLabelData(batch, r).identifier);
    if (!printable.length) {
      setError(t("batch.noRows"));
      return;
    }
    if (
      (labelOptions.codeType === "barcode" || labelOptions.codeType === "both") &&
      printable.some((r) => !isAsciiBarcodeSafe(rowToLabelData(batch, r).identifier))
    ) {
      setError(t("batch.barcodeAsciiWarn"));
      if (labelOptions.codeType === "barcode") return;
    }

    const slice = printable.slice(0, MAX_PDF_BATCH);
    try {
      setBusy(true);
      const { labels, qrDataUrls, barcodeDataUrls } = await buildPdfAssets(slice, batch, labelOptions.codeType);
      await generateInventoryBatchPdf(labels, qrDataUrls, barcodeDataUrls, {
        codeType: labelOptions.codeType,
        labelFormat: labelOptions.labelFormat === "standard" ? "58x40" : labelOptions.labelFormat,
        filename: `${slugBatchFilename(batch.name)}-labels.pdf`,
      });
      await persist(markRowsGenerated(batch, slice.map((r) => r.id)));
    } finally {
      setBusy(false);
    }
  }

  function handleGenerateRow(row: BatchRow) {
    if (!batch) return;
    const data = rowToLabelData(batch, row);
    if (!data.identifier) return;
    if (
      (labelOptions.codeType === "barcode" || labelOptions.codeType === "both") &&
      !isAsciiBarcodeSafe(data.identifier)
    ) {
      setError(t("batch.barcodeAsciiWarn"));
      if (labelOptions.codeType === "barcode") return;
    }
    setSingleRow(row);
  }

  async function handleSinglePrinted() {
    if (!batch || !singleRow) return;
    await persist(markRowsGenerated(batch, [singleRow.id]));
    setSingleRow(null);
  }

  const singleLabel = singleRow && batch ? rowToLabelData(batch, singleRow) : null;

  return (
    <div
      className={`flex flex-col gap-4 w-full ${embedded ? "pt-2" : "p-4 max-w-3xl mx-auto"}`}
    >
      <UploadInstructions
        hasBatch={Boolean(batch?.rows.length)}
        onUploadFile={(f) => void handleUploadFile(f)}
        onImportQhub={(f) => void handleImportQhub(f)}
        onDeleteBase={() => void handleDeleteBase()}
        onReloadRequest={() => {
          if (batch?.rows.length && !window.confirm(t("batch.confirmReload"))) return;
          setReplaceMode(true);
        }}
      />

      {replaceMode && (
        <p className="text-xs text-sky-700 bg-sky-50 border border-sky-100 rounded-lg px-3 py-2">
          {t("batch.reloadBase")} — {t("batch.uploadFile")}
        </p>
      )}

      {pendingFile && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm flex flex-wrap gap-2 items-center">
          <span>{t("batch.confirmReload")}</span>
          <button type="button" onClick={() => void confirmReload()} className="px-3 py-1 rounded-lg bg-gray-900 text-white text-xs">
            OK
          </button>
          <button
            type="button"
            onClick={() => {
              setPendingFile(null);
              setPendingSource(null);
            }}
            className="px-3 py-1 rounded-lg border text-xs"
          >
            {t("cancel")}
          </button>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600 rounded-lg bg-red-50 border border-red-100 px-3 py-2">{error}</p>
      )}

      {batch && batch.step === "quality" && quality && (
        <BatchQualityPanel
          batch={batch}
          quality={quality}
          onChange={setBatch}
          onContinue={handleContinueQuality}
        />
      )}

      {batch && batch.step === "workspace" && (
        <BatchTablePanel
          batch={batch}
          labelOptions={labelOptions}
          onLabelOptionsChange={setLabelOptions}
          onGenerateRow={handleGenerateRow}
          onPrintFiltered={(rows) => void handlePrintFiltered(rows)}
          onExportCsv={() => void downloadBatchCsv(batch, slugBatchFilename(batch.name))}
          onExportXlsx={() => void downloadBatchXlsx(batch, slugBatchFilename(batch.name))}
          busy={busy}
        />
      )}

      <GenerateInvNumbersModal
        open={invModalOpen}
        preview={invPreview}
        pattern={detectInvNumberPattern(batch ? collectAllCellValues(batch.rows) : [])}
        onConfirm={() => void handleCreateInvNumbers()}
        onSkip={() => void handleSkipInvNumbers()}
      />

      {singleLabel && (
        <SingleLabelModal
          open={Boolean(singleRow)}
          identifier={singleLabel.identifier}
          title={singleLabel.title}
          codeType={labelOptions.codeType}
          labelFormat={labelOptions.labelFormat === "standard" ? "58x40" : labelOptions.labelFormat}
          onClose={() => setSingleRow(null)}
          onPrinted={() => void handleSinglePrinted()}
          onDownloadPdf={async () => {
            if (!singleRow || !batch) return;
            setBusy(true);
            try {
              const images = await buildLabelCodeImages(singleLabel.identifier, labelOptions.codeType);
              await generateSingleInventoryLabelPdf(
                { identifier: singleLabel.identifier, title: singleLabel.title },
                images,
                {
                  codeType: labelOptions.codeType,
                  labelFormat: labelOptions.labelFormat === "standard" ? "58x40" : labelOptions.labelFormat,
                  filename: `${slugBatchFilename(singleLabel.identifier)}.pdf`,
                },
              );
              await persist(markRowsGenerated(batch, [singleRow.id]));
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </div>
  );
}
