"use client";

import type { WifiFormData } from "@/lib/qr-generator/types";
import { useQrTranslations } from "@/lib/qr-generator/i18n";
import {
  FormField,
  compactFormGrid,
  compactFormStack,
  compactInputClass,
  compactSelectClass,
  checkboxClass,
} from "./FormField";

interface WifiFormProps {
  data: WifiFormData;
  onChange: (data: WifiFormData) => void;
}

export function WifiForm({ data, onChange }: WifiFormProps) {
  const { t } = useQrTranslations();
  const set = (patch: Partial<WifiFormData>) => onChange({ ...data, ...patch });

  return (
    <div className={compactFormStack}>
      <FormField label={t("ssid")} compact>
        <input
          className={compactInputClass}
          value={data.ssid}
          onChange={(e) => set({ ssid: e.target.value })}
        />
      </FormField>

      <div className={compactFormGrid}>
        <FormField label={t("password")} compact>
          <input
            className={compactInputClass}
            type="password"
            value={data.password}
            onChange={(e) => set({ password: e.target.value })}
            disabled={data.encryption === "nopass"}
          />
        </FormField>
        <FormField label={t("encryption")} compact>
          <select
            className={compactSelectClass}
            value={data.encryption}
            onChange={(e) =>
              set({ encryption: e.target.value as WifiFormData["encryption"] })
            }
          >
            <option value="WPA">WPA/WPA2</option>
            <option value="WEP">WEP</option>
            <option value="nopass">Без пароля</option>
          </select>
        </FormField>
      </div>

      <label className="flex items-center gap-1.5 text-[11px] text-gray-600">
        <input
          type="checkbox"
          className={checkboxClass}
          checked={data.hidden}
          onChange={(e) => set({ hidden: e.target.checked })}
        />
        <span>{t("hidden")}</span>
      </label>
    </div>
  );
}
