"use client";

import type { CodeMarkType, LabelFormat } from "@/lib/qr-generator/types";
import { labelFormatClass } from "@/lib/qr-generator/labelPrint";

interface LabelPrintSheetProps {
  identifier: string;
  title?: string;
  qrDataUrl?: string | null;
  barcodeDataUrl?: string | null;
  codeType?: CodeMarkType;
  labelFormat?: LabelFormat;
  /** Defaults to qr-print-area — used by browser print CSS */
  printAreaId?: string;
  className?: string;
}

export function LabelPrintSheet({
  identifier,
  title,
  qrDataUrl,
  barcodeDataUrl,
  codeType = "qr",
  labelFormat = "standard",
  printAreaId = "qr-print-area",
  className = "",
}: LabelPrintSheetProps) {
  const formatClass = labelFormatClass(labelFormat);
  const showTitle = Boolean(title && title !== identifier);

  return (
    <div
      id={printAreaId}
      data-label-format={labelFormat}
      className={`qr-label-sheet ${formatClass} ${className}`.trim()}
    >
      <div className="qr-label-codes">
        <div className={`qr-label-code-row ${codeType === "both" ? "qr-label-code-row--both" : ""}`}>
          {(codeType === "qr" || codeType === "both") && qrDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrDataUrl} alt="" className="qr-label-qr" />
          )}
          {(codeType === "barcode" || codeType === "both") && barcodeDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={barcodeDataUrl} alt="" className="qr-label-barcode" />
          )}
        </div>
        <div className="qr-label-text">
          {identifier && <p className="qr-label-id">{identifier}</p>}
          {showTitle && <p className="qr-label-title">{title}</p>}
        </div>
      </div>
    </div>
  );
}
