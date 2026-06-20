"use client";

import type { CodeMarkType, LabelFormat, LabelOptions } from "@/lib/qr-generator/types";
import { useQrTranslations } from "@/lib/qr-generator/i18n";
import { FormField, compactSelectClass } from "./FormField";

interface LabelOptionsPanelProps {
  options: LabelOptions;
  onChange: (options: LabelOptions) => void;
}

const FORMATS: LabelFormat[] = [
  "standard",
  "40x30",
  "58x40",
  "a4-grid",
  "mini-20",
  "mini-25",
  "mini-30",
];

const CODE_TYPES: CodeMarkType[] = ["qr", "barcode"];

export function LabelOptionsPanel({ options, onChange }: LabelOptionsPanelProps) {
  const { t } = useQrTranslations();
  const set = (patch: Partial<LabelOptions>) => onChange({ ...options, ...patch });
  const codeType = options.codeType === "both" ? "qr" : options.codeType;

  return (
    <div className="space-y-2 pt-1">
      <FormField label={t("label.codeType")} hint={t("label.codeTypeHint")} compact>
        <div className="flex gap-0.5 p-0.5 rounded-lg bg-gray-100 w-fit">
          {CODE_TYPES.map((ct) => (
            <button
              key={ct}
              type="button"
              onClick={() => set({ codeType: ct })}
              className={`px-2.5 py-1.5 text-[11px] font-medium rounded-md transition-colors ${
                codeType === ct
                  ? "bg-white shadow-sm text-gray-900"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {t(`label.code.${ct}`)}
            </button>
          ))}
        </div>
      </FormField>

      <FormField label={t("label.format")} compact>
        <select
          className={compactSelectClass}
          value={options.labelFormat}
          onChange={(e) => set({ labelFormat: e.target.value as LabelFormat })}
        >
          {FORMATS.map((f) => (
            <option key={f} value={f}>
              {t(`label.format.${f}`)}
            </option>
          ))}
        </select>
      </FormField>
    </div>
  );
}
