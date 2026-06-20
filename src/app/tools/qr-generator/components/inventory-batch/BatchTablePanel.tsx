"use client";

import { useEffect, useMemo, useState } from "react";
import type { BatchRow, InventoryLabelBatch, LabelFilter } from "@/lib/qr-generator/inventory-batch";
import { filterBatchRows } from "@/lib/qr-generator/inventory-batch";
import { useQrTranslations } from "@/lib/qr-generator/i18n";
import { renderCode128DataUrl } from "@/lib/qr-generator/barcode";
import { printLabelSheet } from "@/lib/qr-generator/labelPrintBrowser";
import { LabelPrintSheet } from "../LabelPrintSheet";
import type { LabelFormat, LabelOptions } from "@/lib/qr-generator/types";
import { LabelOptionsPanel } from "../LabelOptionsPanel";

interface Props {
  batch: InventoryLabelBatch;
  labelOptions: LabelOptions;
  onLabelOptionsChange: (o: LabelOptions) => void;
  onGenerateRow: (row: BatchRow) => void;
  onPrintFiltered: (rows: BatchRow[]) => void;
  onExportCsv: () => void;
  onExportXlsx: () => void;
  busy?: boolean;
}

export function BatchTablePanel({
  batch,
  labelOptions,
  onLabelOptionsChange,
  onGenerateRow,
  onPrintFiltered,
  onExportCsv,
  onExportXlsx,
  busy,
}: Props) {
  const { t } = useQrTranslations();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<LabelFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(
    () => filterBatchRows(batch, filter, search),
    [batch, filter, search],
  );

  const filters: { id: LabelFilter; label: string }[] = [
    { id: "all", label: t("batch.filterAll") },
    { id: "generated", label: t("batch.filterGenerated") },
    { id: "not_generated", label: t("batch.filterNotGenerated") },
  ];

  return (
    <div className="flex flex-col gap-4 min-h-0">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{t("batch.workspaceTitle")}</h3>
        <p className="text-xs text-gray-500">
          {batch.name} · {batch.rows.length}
        </p>
      </div>

      <LabelOptionsPanel options={labelOptions} onChange={onLabelOptionsChange} />

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t("batch.search")}
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
      />

      <div className="flex flex-wrap gap-1.5">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 text-xs rounded-lg border ${
              filter === f.id ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="overflow-auto border border-gray-200 rounded-xl max-h-[360px]">
        <table className="min-w-max w-full text-xs">
          <thead className="sticky top-0 bg-gray-50 z-10">
            <tr>
              <th className="px-2 py-2 border-b w-8" />
              {batch.columns.slice(0, 6).map((col) => (
                <th key={col.id} className="px-2 py-2 text-left font-medium text-gray-600 border-b whitespace-nowrap">
                  {col.name}
                </th>
              ))}
              <th className="px-2 py-2 text-left font-medium text-gray-600 border-b">{t("batch.labelStatus")}</th>
              <th className="px-2 py-2 border-b" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr
                key={row.id}
                className={`border-b border-gray-100 hover:bg-gray-50/80 ${selectedId === row.id ? "bg-sky-50" : ""}`}
              >
                <td className="px-2 py-2">
                  <input
                    type="radio"
                    name="batch-row"
                    checked={selectedId === row.id}
                    onChange={() => setSelectedId(row.id)}
                  />
                </td>
                {batch.columns.slice(0, 6).map((col) => (
                  <td key={col.id} className="px-2 py-2 max-w-[160px] truncate" title={row.values[col.id] ?? ""}>
                    {row.values[col.id] ?? ""}
                  </td>
                ))}
                <td className="px-2 py-2">
                  {row.labelGenerated ? (
                    <span className="text-green-700">{t("batch.labelYes")}</span>
                  ) : (
                    <span className="text-gray-400">{t("batch.labelNo")}</span>
                  )}
                </td>
                <td className="px-2 py-2">
                  <button
                    type="button"
                    onClick={() => onGenerateRow(row)}
                    className="text-sky-700 hover:underline whitespace-nowrap"
                  >
                    {t("batch.generateOne")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && (
          <p className="p-4 text-sm text-gray-400 text-center">{t("batch.noRows")}</p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || !selectedId}
          onClick={() => {
            const row = filtered.find((r) => r.id === selectedId) ?? batch.rows.find((r) => r.id === selectedId);
            if (row) onGenerateRow(row);
          }}
          className="px-4 py-2.5 text-sm font-medium rounded-xl bg-gray-900 text-white disabled:opacity-40"
        >
          {t("batch.generateOne")}
        </button>
        <button
          type="button"
          disabled={busy || !filtered.length}
          onClick={() => onPrintFiltered(filtered)}
          className="px-4 py-2.5 text-sm rounded-xl border border-gray-200 bg-white disabled:opacity-40"
        >
          {busy ? t("batch.busy") : t("batch.printFiltered")}
        </button>
        <button
          type="button"
          onClick={onExportCsv}
          className="px-4 py-2.5 text-sm rounded-xl border border-gray-200 bg-white"
        >
          {t("batch.exportCsv")}
        </button>
        <button
          type="button"
          onClick={onExportXlsx}
          className="px-4 py-2.5 text-sm rounded-xl border border-gray-200 bg-white"
        >
          {t("batch.exportXlsx")}
        </button>
      </div>

      <p className="text-[11px] text-gray-500">{t("batch.pdfLimit")}</p>
    </div>
  );
}

interface SingleLabelModalProps {
  open: boolean;
  identifier: string;
  title: string;
  codeType: LabelOptions["codeType"];
  labelFormat: LabelFormat;
  onClose: () => void;
  onPrinted: () => void;
  onDownloadPdf: () => void | Promise<void>;
}

export function SingleLabelModal({
  open,
  identifier,
  title,
  codeType,
  labelFormat,
  onClose,
  onPrinted,
  onDownloadPdf,
}: SingleLabelModalProps) {
  const { t } = useQrTranslations();
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [barcodeUrl, setBarcodeUrl] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  useEffect(() => {
    if (!open || !identifier) return;
    let cancelled = false;
    void (async () => {
      const QRCode = (await import("qrcode")).default;
      if (codeType === "qr" || codeType === "both") {
        const url = await QRCode.toDataURL(identifier, { errorCorrectionLevel: "M", margin: 2, width: 280 });
        if (!cancelled) setQrUrl(url);
      } else setQrUrl(null);

      if (codeType === "barcode" || codeType === "both") {
        const url = await renderCode128DataUrl(identifier, 48);
        if (!cancelled) setBarcodeUrl(url);
      } else setBarcodeUrl(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, identifier, codeType]);

  if (!open) return null;

  const formatKey = labelFormat === "standard" ? "58x40" : labelFormat;

  return (
    <>
      <LabelPrintSheet
        identifier={identifier}
        title={title}
        qrDataUrl={qrUrl}
        barcodeDataUrl={barcodeUrl}
        codeType={codeType}
        labelFormat={labelFormat}
        className="qr-label-offscreen"
      />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 print:hidden">
        <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl space-y-4">
          <div className="flex flex-col items-center gap-2 p-4 border border-gray-100 rounded-xl">
            {(codeType === "qr" || codeType === "both") && qrUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrUrl} alt="QR" className="w-40 h-40" />
            )}
            {(codeType === "barcode" || codeType === "both") && barcodeUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={barcodeUrl} alt="barcode" className="max-w-full h-12 object-contain" />
            )}
            <p className="text-sm font-semibold text-center">{identifier}</p>
            {title && title !== identifier && (
              <p className="text-xs text-gray-500 text-center">{title}</p>
            )}
          </div>
          <div className="flex gap-2 justify-end flex-wrap">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-xl border border-gray-200">
              {t("cancel")}
            </button>
            <button
              type="button"
              disabled={pdfBusy}
              onClick={() => {
                setPdfBusy(true);
                void Promise.resolve(onDownloadPdf()).finally(() => setPdfBusy(false));
              }}
              className="px-4 py-2 text-sm rounded-xl border border-gray-200 bg-white disabled:opacity-50"
            >
              {pdfBusy ? t("batch.busy") : t("batch.downloadLabelPdf")}
            </button>
            <button
              type="button"
              onClick={() => {
                printLabelSheet();
                onPrinted();
              }}
              className="px-4 py-2 text-sm rounded-xl bg-gray-900 text-white"
            >
              {t("printLabel")}
            </button>
          </div>
          <p className="text-[11px] text-gray-500 text-center">
            {t("label.format")}: {t(`label.format.${formatKey}`)} · A4 {t("printLabelHint")}
          </p>
        </div>
      </div>
    </>
  );
}
