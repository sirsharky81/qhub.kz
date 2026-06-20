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
    <div className="space-y-1 pt-1.5 border-t border-gray-100">
      <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">
        {t("inventory.modeLabel")}
      </p>
      <div className="flex gap-0.5 p-0.5 rounded-lg bg-gray-100 w-fit">
        <button
          type="button"
          onClick={() => onChange("single")}
          className={`px-2.5 py-1.5 text-[11px] font-medium rounded-md transition-colors ${
            mode === "single" ? "bg-white shadow-sm text-gray-900" : "text-gray-600 hover:text-gray-900"
          }`}
        >
          {t("inventory.modeSingle")}
        </button>
        <button
          type="button"
          onClick={() => onChange("batch")}
          className={`px-2.5 py-1.5 text-[11px] font-medium rounded-md transition-colors ${
            mode === "batch" ? "bg-white shadow-sm text-gray-900" : "text-gray-600 hover:text-gray-900"
          }`}
        >
          {t("inventory.modeBatch")}
        </button>
      </div>
    </div>
  );
}
