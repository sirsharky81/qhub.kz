"use client";

import type { WifiFormData } from "@/lib/qr-generator/types";
import { useQrTranslations } from "@/lib/qr-generator/i18n";
import { FormField, inputClass, selectClass, checkboxClass } from "./FormField";

interface WifiFormProps {
  data: WifiFormData;
  onChange: (data: WifiFormData) => void;
}

export function WifiForm({ data, onChange }: WifiFormProps) {
  const { t } = useQrTranslations();
  const set = (patch: Partial<WifiFormData>) => onChange({ ...data, ...patch });

  return (
    <div className="space-y-3">
      <FormField label={t("ssid")}>
        <input
          className={inputClass}
          value={data.ssid}
          onChange={(e) => set({ ssid: e.target.value })}
        />
      </FormField>

      <FormField label={t("password")}>
        <input
          className={inputClass}
          type="password"
          value={data.password}
          onChange={(e) => set({ password: e.target.value })}
          disabled={data.encryption === "nopass"}
        />
      </FormField>

      <FormField label={t("encryption")}>
        <select
          className={selectClass}
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

      <label className="flex items-center gap-2 text-xs text-gray-700">
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
