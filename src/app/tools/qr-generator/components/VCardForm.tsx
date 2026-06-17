"use client";

import type { VCardFormData } from "@/lib/qr-generator/types";
import { PHONE_PLACEHOLDER } from "@/lib/qr-generator/constants";
import { isValidBirthday, isValidE164 } from "@/lib/qr-generator/qrUtils";
import { useQrTranslations } from "@/lib/qr-generator/i18n";
import { FormField, inputClass, textareaClass } from "./FormField";

interface VCardFormProps {
  data: VCardFormData;
  onChange: (data: VCardFormData) => void;
}

export function VCardForm({ data, onChange }: VCardFormProps) {
  const { t } = useQrTranslations();
  const set = (patch: Partial<VCardFormData>) => onChange({ ...data, ...patch });

  const phoneError = data.phone && !isValidE164(data.phone) ? t("invalidPhone") : null;
  const birthdayError =
    data.birthday && !isValidBirthday(data.birthday) ? t("invalidBirthday") : null;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <FormField label={t("firstName")}>
          <input
            className={inputClass}
            value={data.firstName}
            onChange={(e) => set({ firstName: e.target.value })}
          />
        </FormField>
        <FormField label={t("lastName")}>
          <input
            className={inputClass}
            value={data.lastName}
            onChange={(e) => set({ lastName: e.target.value })}
          />
        </FormField>
      </div>

      <FormField label={t("organization")}>
        <input
          className={inputClass}
          value={data.organization}
          onChange={(e) => set({ organization: e.target.value })}
        />
      </FormField>

      <FormField label={t("phone")} error={phoneError}>
        <input
          className={inputClass}
          value={data.phone}
          onChange={(e) => set({ phone: e.target.value })}
          placeholder={PHONE_PLACEHOLDER}
        />
      </FormField>

      <FormField label={t("email")}>
        <input
          className={inputClass}
          type="email"
          value={data.email}
          onChange={(e) => set({ email: e.target.value })}
        />
      </FormField>

      <FormField label={t("website")}>
        <input
          className={inputClass}
          value={data.website}
          onChange={(e) => set({ website: e.target.value })}
          placeholder="https://"
        />
      </FormField>

      <FormField label={t("birthday")} error={birthdayError}>
        <input
          className={inputClass}
          type="date"
          value={data.birthday}
          onChange={(e) => set({ birthday: e.target.value })}
        />
      </FormField>

      <FormField label={t("note")}>
        <textarea
          className={textareaClass}
          value={data.note}
          onChange={(e) => set({ note: e.target.value })}
        />
      </FormField>
    </div>
  );
}
