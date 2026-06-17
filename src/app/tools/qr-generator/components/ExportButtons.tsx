"use client";

import { useState } from "react";
import type { QrGenerationResult, QrSettings } from "@/lib/qr-generator/types";
import {
  copyQrToClipboard,
  downloadJpg,
  downloadPng,
  downloadPngTransparent,
  downloadSvg,
} from "@/lib/qr-generator/export";
import { useQrTranslations } from "@/lib/qr-generator/i18n";
import { PickerButton } from "../../random-picker/components/PickerButton";

interface ExportButtonsProps {
  result: QrGenerationResult;
  settings: QrSettings;
  printCaption: string;
  onShare: () => void;
}

export function ExportButtons({
  result,
  settings,
  printCaption,
  onShare,
}: ExportButtonsProps) {
  const { t } = useQrTranslations();
  const [toast, setToast] = useState<string | null>(null);
  const disabled = !result.dataUrl;

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  };

  const handlePrint = (prepare: boolean) => {
    if (prepare) {
      document.body.classList.add("qr-print-mode");
    }
    window.print();
    document.body.classList.remove("qr-print-mode");
  };

  return (
    <div className="space-y-2">
      {toast && (
        <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5 text-center">
          {toast}
        </p>
      )}

      <div className="flex flex-wrap gap-1.5">
        <PickerButton
          variant="secondary"
          disabled={disabled}
          onClick={() => result.dataUrl && downloadPng(result.dataUrl)}
        >
          {t("exportPng")}
        </PickerButton>
        <PickerButton
          variant="secondary"
          disabled={disabled}
          onClick={() =>
            result.dataUrl &&
            downloadPngTransparent(result.dataUrl, settings.background)
          }
        >
          {t("exportPngTransparent")}
        </PickerButton>
        <PickerButton
          variant="secondary"
          disabled={disabled || !result.svg}
          onClick={() => result.svg && downloadSvg(result.svg)}
        >
          {t("exportSvg")}
        </PickerButton>
        <PickerButton
          variant="secondary"
          disabled={disabled}
          onClick={() => result.dataUrl && downloadJpg(result.dataUrl)}
        >
          {t("exportJpg")}
        </PickerButton>
        <PickerButton
          variant="secondary"
          disabled={disabled}
          onClick={async () => {
            if (!result.dataUrl) return;
            try {
              await copyQrToClipboard(result.dataUrl);
              showToast(t("copied"));
            } catch {
              /* clipboard may fail */
            }
          }}
        >
          {t("copyClipboard")}
        </PickerButton>
        <PickerButton variant="secondary" disabled={disabled} onClick={() => handlePrint(false)}>
          {t("print")}
        </PickerButton>
        <PickerButton
          variant="secondary"
          disabled={disabled || !printCaption}
          onClick={() => handlePrint(true)}
        >
          {t("printPrepare")}
        </PickerButton>
        <PickerButton variant="ghost" disabled={disabled} onClick={onShare}>
          {t("share")}
        </PickerButton>
      </div>
    </div>
  );
}
