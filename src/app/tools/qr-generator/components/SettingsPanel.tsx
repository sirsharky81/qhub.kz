"use client";

import type { QrSettings } from "@/lib/qr-generator/types";
import { MAX_LOGO_AREA_PERCENT } from "@/lib/qr-generator/logoOverlay";
import { useQrTranslations } from "@/lib/qr-generator/i18n";
import { FormField, inputClass, selectClass } from "./FormField";

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
    <div className="space-y-3">
      <FormField label={t("size")}>
        <input
          type="range"
          min={200}
          max={1200}
          step={50}
          value={settings.size}
          onChange={(e) => set({ size: parseInt(e.target.value, 10) })}
          className="w-full accent-gray-900"
        />
        <span className="text-xs text-gray-500">{settings.size} px</span>
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField label={t("foreground")}>
          <input
            type="color"
            value={settings.foreground}
            onChange={(e) => set({ foreground: e.target.value })}
            className="w-full h-9 rounded-lg border border-gray-200 cursor-pointer"
          />
        </FormField>
        <FormField label={t("background")}>
          <input
            type="color"
            value={settings.background}
            onChange={(e) => set({ background: e.target.value })}
            className="w-full h-9 rounded-lg border border-gray-200 cursor-pointer"
          />
        </FormField>
      </div>

      <FormField label={t("ecc")}>
        <select
          className={selectClass}
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

      <FormField label={t("logo")} hint={t("logoHint")}>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => handleLogoUpload(e.target.files?.[0] ?? null)}
          className="text-xs text-gray-600 w-full"
        />
        {settings.logoDataUrl && (
          <button
            type="button"
            onClick={() => set({ logoDataUrl: null })}
            className="text-[11px] text-red-600 mt-1"
          >
            {t("delete")}
          </button>
        )}
      </FormField>

      {settings.logoDataUrl && (
        <FormField label={t("logoSize")}>
          <input
            type="range"
            min={5}
            max={MAX_LOGO_AREA_PERCENT}
            value={settings.logoSizePercent}
            onChange={(e) => set({ logoSizePercent: parseInt(e.target.value, 10) })}
            className="w-full accent-gray-900"
          />
          <span className="text-xs text-gray-500">{settings.logoSizePercent}%</span>
        </FormField>
      )}
    </div>
  );
}
