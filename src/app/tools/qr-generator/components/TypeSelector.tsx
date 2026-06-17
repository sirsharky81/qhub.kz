"use client";

import type { QrType } from "@/lib/qr-generator/types";
import { QR_TYPES } from "@/lib/qr-generator/types";
import { typeLabel, useQrTranslations } from "@/lib/qr-generator/i18n";

interface TypeSelectorProps {
  value: QrType;
  onChange: (type: QrType) => void;
}

export function TypeSelector({ value, onChange }: TypeSelectorProps) {
  const { t } = useQrTranslations();

  return (
    <div className="flex flex-wrap gap-1.5">
      {QR_TYPES.map((type) => (
        <button
          key={type}
          type="button"
          onClick={() => onChange(type)}
          className={`px-2.5 py-1.5 text-[11px] font-medium rounded-lg border transition-colors touch-manipulation ${
            value === type
              ? "border-gray-900 bg-gray-900 text-white"
              : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"
          }`}
        >
          {typeLabel(type, t)}
        </button>
      ))}
    </div>
  );
}
