"use client";

import type { QrSettings } from "@/lib/qr-generator/types";
import { MAX_LOGO_AREA_PERCENT } from "@/lib/qr-generator/logoOverlay";
import { useQrTranslations } from "@/lib/qr-generator/i18n";
import {
  FormField,
  compactFormGrid,
  compactFormStack,
  compactSelectClass,
} from "./FormField";

interface SettingsPanelProps {
  settings: QrSettings;
  onChange: (settings: QrSettings) => void;
}

export function SettingsPanel({ settings, onChange }: SettingsPanelProps) {
  const { t } = useQrTranslations();
  const set = (patch: Partial<QrSettings>) => onChange({ ...settings, ...patch });

  const handleLogoUpload = (file: File | null) => {
    if (!file) {
      set({ logoDataUrl: null });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => set({ logoDataUrl: reader.result as string });
    reader.readAsDataURL(file);
  };

  return (
    <div className={compactFormStack}>
      <FormField label={t("size")} compact>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={200}
            max={1200}
            step={50}
            value={settings.size}
            onChange={(e) => set({ size: parseInt(e.target.value, 10) })}
            className="flex-1 min-w-0 accent-gray-900 h-4"
          />
          <span className="text-[10px] text-gray-500 tabular-nums shrink-0 w-12 text-right">
            {settings.size}px
          </span>
        </div>
      </FormField>

      <div className={compactFormGrid}>
        <FormField label={t("foreground")} compact>
          <input
            type="color"
            value={settings.foreground}
            onChange={(e) => set({ foreground: e.target.value })}
            className="w-full h-7 rounded-md border border-gray-200 cursor-pointer p-0.5"
          />
        </FormField>
        <FormField label={t("background")} compact>
          <input
            type="color"
            value={settings.background}
            onChange={(e) => set({ background: e.target.value })}
            className="w-full h-7 rounded-md border border-gray-200 cursor-pointer p-0.5"
          />
        </FormField>
      </div>

      <FormField label={t("ecc")} compact>
        <select
          className={compactSelectClass}
          value={settings.errorCorrectionLevel}
          onChange={(e) =>
            set({
              errorCorrectionLevel: e.target.value as QrSettings["errorCorrectionLevel"],
            })
          }
          disabled={Boolean(settings.logoDataUrl)}
        >
          <option value="L">L (7%)</option>
          <option value="M">M (15%)</option>
          <option value="Q">Q (25%)</option>
          <option value="H">H (30%)</option>
        </select>
      </FormField>

      <FormField label={t("logo")} hint={t("logoHint")} compact>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => handleLogoUpload(e.target.files?.[0] ?? null)}
          className="text-[10px] text-gray-600 w-full"
        />
        {settings.logoDataUrl && (
          <button
            type="button"
            onClick={() => set({ logoDataUrl: null })}
            className="text-[10px] text-red-600 mt-0.5"
          >
            {t("delete")}
          </button>
        )}
      </FormField>

      {settings.logoDataUrl && (
        <FormField label={t("logoSize")} compact>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={5}
              max={MAX_LOGO_AREA_PERCENT}
              value={settings.logoSizePercent}
              onChange={(e) => set({ logoSizePercent: parseInt(e.target.value, 10) })}
              className="flex-1 min-w-0 accent-gray-900 h-4"
            />
            <span className="text-[10px] text-gray-500 tabular-nums shrink-0 w-8 text-right">
              {settings.logoSizePercent}%
            </span>
          </div>
        </FormField>
      )}
    </div>
  );
}
