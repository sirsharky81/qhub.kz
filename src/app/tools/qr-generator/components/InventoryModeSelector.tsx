"use client";

import { useQrTranslations } from "@/lib/qr-generator/i18n";

export type InventoryMode = "single" | "batch";

interface Props {
  mode: InventoryMode;
  onChange: (mode: InventoryMode) => void;
}

export function InventoryModeSelector({ mode, onChange }: Props) {
  const { t } = useQrTranslations();

  return (
    <div className="space-y-1.5 pt-2 border-t border-gray-100">
      <p className="text-[11px] font-medium text-gray-500">{t("inventory.modeLabel")}</p>
      <div className="flex gap-1 p-1 rounded-xl bg-gray-100 w-fit">
        <button
          type="button"
          onClick={() => onChange("single")}
          className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
            mode === "single" ? "bg-white shadow-sm text-gray-900" : "text-gray-600 hover:text-gray-900"
          }`}
        >
          {t("inventory.modeSingle")}
        </button>
        <button
          type="button"
          onClick={() => onChange("batch")}
          className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
            mode === "batch" ? "bg-white shadow-sm text-gray-900" : "text-gray-600 hover:text-gray-900"
          }`}
        >
          {t("inventory.modeBatch")}
        </button>
      </div>
    </div>
  );
}
