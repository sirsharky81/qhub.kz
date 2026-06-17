"use client";

import { useQrTranslations } from "@/lib/qr-generator/i18n";

export function Disclaimer({ variant = "general" }: { variant?: "general" | "payment" }) {
  const { t } = useQrTranslations();

  return (
    <div className="text-[11px] text-gray-500 leading-relaxed border-t border-gray-100 pt-4 mt-4 space-y-2">
      {variant === "payment" && (
        <p className="text-blue-800 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
          {t("paymentDisclaimer")}
        </p>
      )}
      <p>{t("disclaimer")}</p>
    </div>
  );
}
