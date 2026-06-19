"use client";

import type { InvNumberPattern } from "@/lib/qr-generator/inventory-batch";
import { useQrTranslations } from "@/lib/qr-generator/i18n";

interface Props {
  open: boolean;
  preview: string[];
  pattern: InvNumberPattern;
  onConfirm: () => void;
  onSkip: () => void;
}

export function GenerateInvNumbersModal({ open, preview, onConfirm, onSkip }: Props) {
  const { t } = useQrTranslations();
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl space-y-4">
        <h3 className="text-base font-semibold">{t("batch.invModalTitle")}</h3>
        <p className="text-sm text-gray-600">{t("batch.invModalText")}</p>
        <div className="rounded-lg bg-gray-50 px-3 py-2">
          <p className="text-xs text-gray-500 mb-1">{t("batch.invPreview")}</p>
          <p className="text-sm font-mono">{preview.join(", ")}</p>
        </div>
        <div className="flex gap-2 justify-end flex-wrap">
          <button
            type="button"
            onClick={onSkip}
            className="px-4 py-2 text-sm rounded-xl border border-gray-200"
          >
            {t("batch.invSkip")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 text-sm rounded-xl bg-gray-900 text-white"
          >
            {t("batch.invCreate")}
          </button>
        </div>
      </div>
    </div>
  );
}
