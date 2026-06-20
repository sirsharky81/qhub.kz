"use client";

import type { CapacityInfo } from "@/lib/qr-generator/capacity";
import { useQrTranslations } from "@/lib/qr-generator/i18n";

interface CapacityIndicatorProps {
  info: CapacityInfo;
  variant: "storage" | "inventory";
  miniLabel?: boolean;
  compact?: boolean;
}

export function CapacityIndicator({ info, variant, miniLabel, compact }: CapacityIndicatorProps) {
  const { t } = useQrTranslations();

  const barColor =
    info.overflow ? "bg-red-500" : info.percent > 85 ? "bg-amber-500" : "bg-emerald-500";

  return (
    <div
      className={`rounded-md border border-gray-200 bg-gray-50/80 ${
        compact ? "space-y-1 px-2 py-1.5" : "space-y-1.5 px-3 py-2.5"
      }`}
    >
      <div className="flex justify-between text-[11px] text-gray-600">
        <span>{t("capacity.label")}</span>
        <span>
          {info.byteLength} / {info.maxBytes} {t("capacity.bytes")} ({info.percent}%)
          {info.qrVersion != null && ` · QR v${info.qrVersion}`}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${Math.min(100, info.percent)}%` }}
        />
      </div>
      {info.overflow && (
        <p className="text-[11px] text-red-700 leading-snug">{t("capacity.overflow")}</p>
      )}
      {!info.overflow && info.percent > 70 && variant === "storage" && (
        <p className="text-[11px] text-amber-700 leading-snug">{t("capacity.warning")}</p>
      )}
      {miniLabel && info.qrVersion != null && info.qrVersion > 5 && (
        <p className="text-[11px] text-amber-800 leading-snug">{t("capacity.miniWarning")}</p>
      )}
      {info.cyrillicChars > 0 && (
        <p className="text-[10px] text-gray-500">{t("capacity.cyrillicHint")}</p>
      )}
    </div>
  );
}
