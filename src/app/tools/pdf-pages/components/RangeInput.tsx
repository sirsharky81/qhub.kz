"use client";

import { useTranslations } from "next-intl";

interface RangeInputProps {
  value: string;
  onChange: (value: string) => void;
  error: string | null;
  placeholder?: string;
  label?: string;
}

export function RangeInput({ value, onChange, error, placeholder, label }: RangeInputProps) {
  const t = useTranslations("range");

  return (
    <div className="space-y-1">
      {label && (
        <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
          {label}
        </label>
      )}
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? t("placeholder")}
        className={`w-full px-3 py-2 text-sm text-gray-800 bg-white border rounded-lg outline-none focus:ring-2 focus:ring-gray-900/5 transition-colors ${
          error ? "border-red-300 focus:border-red-400" : "border-gray-200 focus:border-gray-400"
        }`}
      />
      {error && <p className="text-xs text-red-600">{t(`errors.${error}`)}</p>}
      <p className="text-[11px] text-gray-400">{t("hint")}</p>
    </div>
  );
}
