"use client";

import type { VCardFormData } from "@/lib/qr-generator/types";
import { PHONE_PLACEHOLDER } from "@/lib/qr-generator/constants";
import { isValidBirthday, isValidE164 } from "@/lib/qr-generator/qrUtils";
import { useQrTranslations } from "@/lib/qr-generator/i18n";
import {
  FormField,
  compactFormGrid,
  compactFormStack,
  compactInputClass,
  compactTextareaClass,
} from "./FormField";

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
    <div className={compactFormStack}>
      <div className={compactFormGrid}>
        <FormField label={t("firstName")} compact>
          <input
            className={compactInputClass}
            value={data.firstName}
            onChange={(e) => set({ firstName: e.target.value })}
          />
        </FormField>
        <FormField label={t("lastName")} compact>
          <input
            className={compactInputClass}
            value={data.lastName}
            onChange={(e) => set({ lastName: e.target.value })}
          />
        </FormField>
      </div>

      <FormField label={t("organization")} compact>
        <input
          className={compactInputClass}
          value={data.organization}
          onChange={(e) => set({ organization: e.target.value })}
        />
      </FormField>

      <div className={compactFormGrid}>
        <FormField label={t("phone")} error={phoneError} compact>
          <input
            className={compactInputClass}
            value={data.phone}
            onChange={(e) => set({ phone: e.target.value })}
            placeholder={PHONE_PLACEHOLDER}
          />
        </FormField>
        <FormField label={t("email")} compact>
          <input
            className={compactInputClass}
            type="email"
            value={data.email}
            onChange={(e) => set({ email: e.target.value })}
          />
        </FormField>
      </div>

      <div className={compactFormGrid}>
        <FormField label={t("website")} compact>
          <input
            className={compactInputClass}
            value={data.website}
            onChange={(e) => set({ website: e.target.value })}
            placeholder="https://"
          />
        </FormField>
        <FormField label={t("birthday")} error={birthdayError} compact>
          <input
            className={compactInputClass}
            type="date"
            value={data.birthday}
            onChange={(e) => set({ birthday: e.target.value })}
          />
        </FormField>
      </div>

      <FormField label={t("note")} compact>
        <textarea
          className={compactTextareaClass}
          value={data.note}
          onChange={(e) => set({ note: e.target.value })}
        />
      </FormField>
    </div>
  );
}
