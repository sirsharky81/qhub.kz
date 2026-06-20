"use client";

import type { QrGenerationResult, CodeMarkType, LabelFormat } from "@/lib/qr-generator/types";
import { useQrTranslations } from "@/lib/qr-generator/i18n";
import { LabelPrintSheet } from "./LabelPrintSheet";
import { compactNoticeClass } from "./FormField";

interface QRPreviewProps {
  result: QrGenerationResult;
  generating: boolean;
  printCaption?: string;
  labelIdentifier?: string;
  labelTitle?: string;
  barcodeDataUrl?: string | null;
  codeType?: CodeMarkType;
  labelFormat?: LabelFormat;
  showLabelText?: boolean;
}

export function QRPreview({
  result,
  generating,
  printCaption,
  labelIdentifier,
  labelTitle,
  barcodeDataUrl,
  codeType = "qr",
  labelFormat = "standard",
  showLabelText = false,
}: QRPreviewProps) {
  const { t } = useQrTranslations();
  const isLabel = showLabelText && Boolean(labelIdentifier);
  const displayId = labelIdentifier || printCaption;
  const displayTitle = labelTitle;

  return (
    <div className="flex flex-col items-center gap-1.5 max-w-lg">
      <div className="relative w-full rounded-lg border border-gray-200 bg-white p-3 min-h-[140px] flex items-center justify-center">
        {generating && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 rounded-lg z-10">
            <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
          </div>
        )}

        {isLabel && (result.dataUrl || barcodeDataUrl) ? (
          <LabelPrintSheet
            identifier={displayId ?? ""}
            title={displayTitle}
            qrDataUrl={result.dataUrl}
            barcodeDataUrl={barcodeDataUrl}
            codeType={codeType}
            labelFormat={labelFormat}
          />
        ) : (result.dataUrl || barcodeDataUrl) ? (
          <div id="qr-print-area" className="flex flex-col items-center gap-1">
            {(codeType === "qr" || codeType === "both") && result.dataUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={result.dataUrl}
                alt="QR code preview"
                className="max-w-[180px] max-h-[180px] w-auto h-auto"
                style={{ imageRendering: "pixelated" }}
              />
            )}
            {(codeType === "barcode" || codeType === "both") && barcodeDataUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={barcodeDataUrl}
                alt="Barcode preview"
                className="max-w-full h-auto"
                style={{ maxWidth: codeType === "both" ? 120 : 200 }}
              />
            )}
            {printCaption && (
              <p className="hidden print:block mt-2 text-lg font-semibold text-center text-gray-900">
                {printCaption}
              </p>
            )}
          </div>
        ) : (
          <div className="text-center text-gray-400 text-xs py-6">{result.error ? t(result.error) : t("preview")}</div>
        )}
      </div>

      {result.error && result.dataUrl === null && result.payload && (
        <p className={`${compactNoticeClass} text-red-700 bg-red-50 border-red-200 w-full text-center`}>
          {t(result.error)}
        </p>
      )}

      {result.contrastWarning && (
        <p className={`${compactNoticeClass} text-amber-700 bg-amber-50 border-amber-200 w-full text-center`}>
          {t("contrastWarning")}
        </p>
      )}

      {result.decodeOk === false && codeType !== "barcode" && (
        <p className={`${compactNoticeClass} text-red-700 bg-red-50 border-red-200 w-full text-center`}>
          {t("decodeFail")}
        </p>
      )}

      {result.decodeOk === true && result.dataUrl && codeType !== "barcode" && (
        <p className={`${compactNoticeClass} text-emerald-700 bg-emerald-50 border-emerald-200 w-full text-center`}>
          {t("decodeOk")}
        </p>
      )}

      {result.effectiveEcc === "H" && result.dataUrl && (
        <p className="text-[10px] text-gray-500 text-center">{t("eccForced")}</p>
      )}
    </div>
  );
}
