"use client";

import type { CodeMarkType, LabelFormat, LabelOptions } from "@/lib/qr-generator/types";
import { useQrTranslations } from "@/lib/qr-generator/i18n";
import { FormField, selectClass } from "./FormField";

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

const CODE_TYPES: CodeMarkType[] = ["qr", "barcode", "both"];

export function LabelOptionsPanel({ options, onChange }: LabelOptionsPanelProps) {
  const { t } = useQrTranslations();
  const set = (patch: Partial<LabelOptions>) => onChange({ ...options, ...patch });

  return (
    <div className="space-y-3">
      <FormField label={t("label.codeType")} hint={t("label.codeTypeHint")}>
        <select
          className={selectClass}
          value={options.codeType}
          onChange={(e) => set({ codeType: e.target.value as CodeMarkType })}
        >
          {CODE_TYPES.map((ct) => (
            <option key={ct} value={ct}>
              {t(`label.code.${ct}`)}
            </option>
          ))}
        </select>
      </FormField>

      <FormField label={t("label.format")}>
        <select
          className={selectClass}
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
