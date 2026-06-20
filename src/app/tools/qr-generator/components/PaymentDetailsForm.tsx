"use client";

import type { PaymentFormData } from "@/lib/qr-generator/types";
import { PHONE_PLACEHOLDER } from "@/lib/qr-generator/constants";
import { hasSensitivePaymentData } from "@/lib/qr-generator/sensitiveDataGuard";
import { useQrTranslations } from "@/lib/qr-generator/i18n";
import {
  FormField,
  compactFormGrid,
  compactFormStack,
  compactInputClass,
  compactNoticeClass,
  checkboxClass,
} from "./FormField";

interface PaymentDetailsFormProps {
  data: PaymentFormData;
  onChange: (data: PaymentFormData) => void;
}

export function PaymentDetailsForm({ data, onChange }: PaymentDetailsFormProps) {
  const { t } = useQrTranslations();
  const sensitive = hasSensitivePaymentData(data);

  const set = (patch: Partial<PaymentFormData>) => onChange({ ...data, ...patch });

  return (
    <div className={compactFormStack}>
      <p className={`${compactNoticeClass} text-blue-800 bg-blue-50 border-blue-200`}>
        {t("paymentDisclaimer")}
      </p>

      <FormField label={t("recipientName")} compact>
        <input
          className={compactInputClass}
          value={data.recipientName}
          onChange={(e) => set({ recipientName: e.target.value })}
          placeholder="Иванов Иван"
        />
      </FormField>

      <div className={compactFormGrid}>
        <FormField label={t("purpose")} compact>
          <input
            className={compactInputClass}
            value={data.purpose}
            onChange={(e) => set({ purpose: e.target.value })}
          />
        </FormField>
        <FormField label={t("amount")} compact>
          <input
            className={compactInputClass}
            value={data.amount}
            onChange={(e) => set({ amount: e.target.value })}
            placeholder="5000 ₸"
          />
        </FormField>
      </div>

      <div className={compactFormGrid}>
        <FormField label={t("cardOrPhone")} compact>
          <input
            className={compactInputClass}
            value={data.cardOrPhone}
            onChange={(e) => set({ cardOrPhone: e.target.value })}
            placeholder={PHONE_PLACEHOLDER}
          />
        </FormField>
        <FormField label={t("iban")} compact>
          <input
            className={compactInputClass}
            value={data.iban}
            onChange={(e) => set({ iban: e.target.value })}
          />
        </FormField>
      </div>

      <FormField label={t("iinBin")} compact>
        <input
          className={compactInputClass}
          value={data.iinBin}
          onChange={(e) => set({ iinBin: e.target.value })}
        />
      </FormField>

      {sensitive && (
        <>
          <p className={`${compactNoticeClass} text-amber-800 bg-amber-50 border-amber-200`}>
            {t("iinWarning")}
          </p>
          <label className="flex items-start gap-1.5 text-[11px] text-gray-600">
            <input
              type="checkbox"
              className={`mt-0.5 ${checkboxClass}`}
              checked={data.saveDespiteSensitive}
              onChange={(e) => set({ saveDespiteSensitive: e.target.checked })}
            />
            <span>{t("saveDespiteSensitive")}</span>
          </label>
        </>
      )}
    </div>
  );
}
