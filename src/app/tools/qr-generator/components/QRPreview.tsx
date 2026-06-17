"use client";

import type { QrGenerationResult, CodeMarkType, LabelFormat } from "@/lib/qr-generator/types";
import { labelFormatClass } from "@/lib/qr-generator/labelPrint";
import { useQrTranslations } from "@/lib/qr-generator/i18n";

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
  const formatClass = labelFormatClass(labelFormat);
  const displayId = labelIdentifier || printCaption;
  const displayTitle = labelTitle;

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        id="qr-print-area"
        className={`relative flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white p-6 min-h-[240px] w-full ${formatClass}`}
      >
        {generating && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 rounded-xl z-10">
            <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
          </div>
        )}

        {(result.dataUrl || barcodeDataUrl) ? (
          <div className="qr-label-codes flex flex-col items-center gap-2">
            <div className={`flex items-center gap-3 ${codeType === "both" ? "flex-row" : "flex-col"}`}>
              {(codeType === "qr" || codeType === "both") && result.dataUrl && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={result.dataUrl}
                  alt="QR code preview"
                  className="qr-label-qr max-w-full h-auto"
                  style={{ imageRendering: "pixelated", maxWidth: 280 }}
                />
              )}
              {(codeType === "barcode" || codeType === "both") && barcodeDataUrl && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={barcodeDataUrl}
                  alt="Barcode preview"
                  className="qr-label-barcode max-w-full h-auto"
                  style={{ maxWidth: codeType === "both" ? 160 : 280 }}
                />
              )}
            </div>

            {(showLabelText || displayId) && (
              <div className="qr-label-text text-center mt-2 print:block">
                {displayId && (
                  <p className="text-sm font-bold text-gray-900 tracking-tight">{displayId}</p>
                )}
                {displayTitle && (
                  <p className="text-xs text-gray-600 mt-0.5 max-w-[280px]">{displayTitle}</p>
                )}
              </div>
            )}

            {printCaption && !showLabelText && (
              <p className="hidden print:block mt-4 text-lg font-semibold text-center text-gray-900">
                {printCaption}
              </p>
            )}
          </div>
        ) : (
          <div className="text-center text-gray-400 text-sm py-12">
            {result.error ? t(result.error) : t("preview")}
          </div>
        )}
      </div>

      {result.error && result.dataUrl === null && result.payload && (
        <p className="text-xs text-red-600 text-center">{t(result.error)}</p>
      )}

      {result.contrastWarning && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 text-center w-full">
          {t("contrastWarning")}
        </p>
      )}

      {result.decodeOk === false && codeType !== "barcode" && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5 text-center w-full">
          {t("decodeFail")}
        </p>
      )}

      {result.decodeOk === true && result.dataUrl && codeType !== "barcode" && (
        <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5 text-center w-full">
          {t("decodeOk")}
        </p>
      )}

      {result.effectiveEcc === "H" && result.dataUrl && (
        <p className="text-[11px] text-gray-500 text-center">{t("eccForced")}</p>
      )}
    </div>
  );
}
