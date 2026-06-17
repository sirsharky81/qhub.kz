"use client";

import type { PaymentFormData } from "@/lib/qr-generator/types";
import { PHONE_PLACEHOLDER } from "@/lib/qr-generator/constants";
import { hasSensitivePaymentData } from "@/lib/qr-generator/sensitiveDataGuard";
import { useQrTranslations } from "@/lib/qr-generator/i18n";
import { FormField, inputClass, checkboxClass } from "./FormField";

interface PaymentDetailsFormProps {
  data: PaymentFormData;
  onChange: (data: PaymentFormData) => void;
}

export function PaymentDetailsForm({ data, onChange }: PaymentDetailsFormProps) {
  const { t } = useQrTranslations();
  const sensitive = hasSensitivePaymentData(data);

  const set = (patch: Partial<PaymentFormData>) => onChange({ ...data, ...patch });

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-blue-800 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 leading-snug">
        {t("paymentDisclaimer")}
      </p>

      <FormField label={t("recipientName")}>
        <input
          className={inputClass}
          value={data.recipientName}
          onChange={(e) => set({ recipientName: e.target.value })}
          placeholder="Иванов Иван"
        />
      </FormField>

      <FormField label={t("purpose")}>
        <input
          className={inputClass}
          value={data.purpose}
          onChange={(e) => set({ purpose: e.target.value })}
        />
      </FormField>

      <FormField label={t("amount")}>
        <input
          className={inputClass}
          value={data.amount}
          onChange={(e) => set({ amount: e.target.value })}
          placeholder="5000 ₸"
        />
      </FormField>

      <FormField label={t("cardOrPhone")}>
        <input
          className={inputClass}
          value={data.cardOrPhone}
          onChange={(e) => set({ cardOrPhone: e.target.value })}
          placeholder={PHONE_PLACEHOLDER}
        />
      </FormField>

      <FormField label={t("iban")}>
        <input
          className={inputClass}
          value={data.iban}
          onChange={(e) => set({ iban: e.target.value })}
        />
      </FormField>

      <FormField label={t("iinBin")}>
        <input
          className={inputClass}
          value={data.iinBin}
          onChange={(e) => set({ iinBin: e.target.value })}
        />
      </FormField>

      {sensitive && (
        <>
          <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-snug">
            {t("iinWarning")}
          </p>
          <label className="flex items-start gap-2 text-xs text-gray-700">
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
