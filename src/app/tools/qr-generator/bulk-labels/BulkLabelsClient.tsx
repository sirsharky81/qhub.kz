"use client";

import { useState } from "react";
import Link from "next/link";
import {
  QrI18nProvider,
  LOCALE_OPTIONS,
  useQrTranslations,
  type QrLocale,
} from "@/lib/qr-generator/i18n";
import type { CodeMarkType } from "@/lib/qr-generator/types";
import {
  generateBulkLabelsPdf,
  generateRangeList,
  parseBulkList,
} from "@/lib/qr-generator/labelPrint";
import { renderCode128DataUrl } from "@/lib/qr-generator/barcode";
import { PrivacyBanner } from "../../file-converter/components/PrivacyBanner";
import { PickerButton, PickerSection } from "../../random-picker/components/PickerButton";
import { FormField, inputClass, selectClass, textareaClass } from "../components/FormField";

function BulkLabelsInner() {
  const { t } = useQrTranslations();
  const [mode, setMode] = useState<"list" | "range">("list");
  const [listText, setListText] = useState("");
  const [prefix, setPrefix] = useState("BOX-");
  const [from, setFrom] = useState("1");
  const [to, setTo] = useState("10");
  const [codeType, setCodeType] = useState<CodeMarkType>("qr");
  const [busy, setBusy] = useState(false);

  const handleGenerate = async () => {
    setBusy(true);
    try {
      const labels =
        mode === "list"
          ? parseBulkList(listText)
          : generateRangeList(prefix, parseInt(from, 10) || 1, parseInt(to, 10) || 1);
      if (!labels.length) return;

      const QRCode = (await import("qrcode")).default;
      const qrDataUrls: (string | null)[] = [];
      const barcodeDataUrls: (string | null)[] = [];

      for (const row of labels) {
        if (codeType === "qr" || codeType === "both") {
          qrDataUrls.push(
            await QRCode.toDataURL(row.identifier, {
              errorCorrectionLevel: "M",
              margin: 2,
              width: 200,
            }),
          );
        } else {
          qrDataUrls.push(null);
        }
        if (codeType === "barcode" || codeType === "both") {
          barcodeDataUrls.push(await renderCode128DataUrl(row.identifier));
        } else {
          barcodeDataUrls.push(null);
        }
      }

      await generateBulkLabelsPdf(labels, qrDataUrls, barcodeDataUrls, codeType);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-gray-50">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">
          <div className="space-y-1">
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">{t("bulk.title")}</h1>
            <p className="text-xs text-gray-500">{t("bulk.subtitle")}</p>
            <PrivacyBanner compact />
            <Link
              href="/tools/qr-generator"
              className="text-[11px] text-gray-500 hover:text-gray-800 underline"
            >
              ← QR-генератор
            </Link>
          </div>

          <div className="flex gap-1.5">
            <PickerButton
              variant={mode === "list" ? "primary" : "ghost"}
              onClick={() => setMode("list")}
            >
              {t("bulk.list")}
            </PickerButton>
            <PickerButton
              variant={mode === "range" ? "primary" : "ghost"}
              onClick={() => setMode("range")}
            >
              {t("bulk.range")}
            </PickerButton>
          </div>

          {mode === "list" ? (
            <FormField label={t("bulk.list")}>
              <textarea
                className={textareaClass}
                value={listText}
                onChange={(e) => setListText(e.target.value)}
                placeholder={"BOX-001\nBOX-002;Гараж\nOS-00231;Ноутбук"}
                rows={8}
              />
            </FormField>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <FormField label={t("bulk.prefix")}>
                <input className={inputClass} value={prefix} onChange={(e) => setPrefix(e.target.value)} />
              </FormField>
              <FormField label={t("bulk.from")}>
                <input className={inputClass} type="number" value={from} onChange={(e) => setFrom(e.target.value)} />
              </FormField>
              <FormField label={t("bulk.to")}>
                <input className={inputClass} type="number" value={to} onChange={(e) => setTo(e.target.value)} />
              </FormField>
            </div>
          )}

          <PickerSection title={t("label.codeType")}>
            <select
              className={selectClass}
              value={codeType}
              onChange={(e) => setCodeType(e.target.value as CodeMarkType)}
            >
              <option value="qr">{t("label.code.qr")}</option>
              <option value="barcode">{t("label.code.barcode")}</option>
              <option value="both">{t("label.code.both")}</option>
            </select>
          </PickerSection>

          <PickerButton variant="primary" disabled={busy} onClick={() => void handleGenerate()}>
            {busy ? t("bulk.generating") : t("bulk.generate")}
          </PickerButton>
        </div>
      </div>
    </div>
  );
}

export default function BulkLabelsClient() {
  const [locale, setLocale] = useState<QrLocale>("ru");

  return (
    <QrI18nProvider locale={locale}>
      <div className="flex justify-end px-4 pt-2 gap-1 print:hidden">
        {LOCALE_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setLocale(opt.id)}
            className={`px-2 py-0.5 text-[11px] font-semibold rounded-md transition-colors touch-manipulation ${
              locale === opt.id ? "bg-gray-900 text-white" : "text-gray-500 hover:text-gray-800"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <BulkLabelsInner />
    </QrI18nProvider>
  );
}
