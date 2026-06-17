"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { QrFormData, QrSettings, QrType } from "@/lib/qr-generator/types";
import { DEFAULT_SETTINGS } from "@/lib/qr-generator/types";
import {
  emptyForm,
  getFormLabel,
  buildShareUrl,
  parseFromUrl,
  saveHistoryEntry,
  loadHistory,
  clearHistory,
  loadTemplates,
  saveTemplate,
  deleteTemplate,
  QrI18nProvider,
  LOCALE_OPTIONS,
  typeHint,
  useQrTranslations,
  type QrLocale,
} from "@/lib/qr-generator";
import { useQRCode } from "@/hooks/useQRCode";
import { PrivacyBanner } from "../file-converter/components/PrivacyBanner";
import { PickerSection } from "../random-picker/components/PickerButton";
import { TypeSelector } from "./components/TypeSelector";
import { TypeForm } from "./components/TypeForm";
import { QRPreview } from "./components/QRPreview";
import { SettingsPanel } from "./components/SettingsPanel";
import { ExportButtons } from "./components/ExportButtons";
import { HistoryPanel, TemplatesPanel } from "./components/HistoryPanel";
import { Disclaimer } from "./components/Disclaimer";
import { ScenarioLinks } from "./components/ScenarioLinks";

interface QrGeneratorInnerProps {
  initialType?: QrType;
  seoTitle?: string;
  seoDesc?: string;
  seoTitleKey?: string;
  seoDescKey?: string;
  disclaimerVariant?: "general" | "payment";
}

function QrGeneratorInner({
  initialType = "text",
  seoTitle,
  seoDesc,
  seoTitleKey,
  seoDescKey,
  disclaimerVariant = "general",
}: QrGeneratorInnerProps) {
  const { t } = useQrTranslations();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [form, setForm] = useState<QrFormData>(() => emptyForm(initialType));
  const [settings, setSettings] = useState<QrSettings>(DEFAULT_SETTINGS);
  const [printCaption, setPrintCaption] = useState("");
  const [history, setHistory] = useState(() => loadHistory());
  const [templates, setTemplates] = useState(() => loadTemplates());
  const [shareToast, setShareToast] = useState(false);

  const { result, generating } = useQRCode(form, settings);

  useEffect(() => {
    const parsed = parseFromUrl(searchParams.toString());
    if (parsed.form) setForm(parsed.form);
    if (Object.keys(parsed.settings).length > 0) {
      setSettings((s) => ({ ...s, ...parsed.settings }));
    }
  }, [searchParams]);

  useEffect(() => {
    if (!result.payload || !result.dataUrl || result.error) return;
    const timer = setTimeout(() => {
      saveHistoryEntry(form, result.payload, settings);
      setHistory(loadHistory());
    }, 2000);
    return () => clearTimeout(timer);
  }, [result.payload, result.dataUrl, result.error, form, settings]);

  const handleTypeChange = (type: QrType) => {
    setForm(emptyForm(type));
  };

  const defaultPrintCaption = useMemo(() => {
    if (form.type === "wifi") return form.data.ssid;
    if (form.type === "payment") return form.data.recipientName;
    return getFormLabel(form);
  }, [form]);

  const effectivePrintCaption = printCaption || defaultPrintCaption;

  const handleShare = useCallback(async () => {
    const url = buildShareUrl(form, settings, pathname);
    try {
      await navigator.clipboard.writeText(url);
      setShareToast(true);
      setTimeout(() => setShareToast(false), 2000);
    } catch {
      window.prompt("URL:", url);
    }
  }, [form, settings, pathname]);

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-gray-50">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">
          <div className="space-y-1">
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">
              {seoTitle ?? (seoTitleKey ? t(seoTitleKey) : t("title"))}
            </h1>
            <p className="text-xs text-gray-500">
              {seoDesc ?? (seoDescKey ? t(seoDescKey) : t("subtitle"))}
            </p>
            <PrivacyBanner compact />
            <div className="pt-2 space-y-1.5">
              <p className="text-[11px] font-medium text-gray-500">{t("seoScenarios")}</p>
              <ScenarioLinks />
            </div>
          </div>

          {shareToast && (
            <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5 text-center">
              {t("shareCopied")}
            </p>
          )}

          <PickerSection title={t("typeLabel")} hint={typeHint(form.type, t)}>
            <TypeSelector value={form.type} onChange={handleTypeChange} />
            <TypeForm form={form} onChange={setForm} />
          </PickerSection>

          <PickerSection title={t("preview")}>
            <QRPreview
              result={result}
              generating={generating}
              printCaption={effectivePrintCaption}
            />
          </PickerSection>

          <PickerSection title={t("settings")}>
            <SettingsPanel settings={settings} onChange={setSettings} />
          </PickerSection>

          <PickerSection title={t("export")}>
            <FormFieldPrintCaption
              value={printCaption}
              onChange={setPrintCaption}
              placeholder={defaultPrintCaption}
            />
            <ExportButtons
              result={result}
              settings={settings}
              printCaption={effectivePrintCaption}
              onShare={handleShare}
            />
          </PickerSection>

          <PickerSection title={t("history")}>
            <HistoryPanel
              entries={history}
              onLoad={(entry) => {
                setForm(entry.formSnapshot);
                setSettings(entry.settings);
              }}
              onClear={() => {
                clearHistory();
                setHistory([]);
              }}
            />
          </PickerSection>

          <PickerSection title={t("templates")}>
            <TemplatesPanel
              templates={templates}
              onLoad={(id) => {
                const tpl = templates.find((t) => t.id === id);
                if (tpl) {
                  setForm(tpl.formSnapshot);
                  setSettings((s) => ({ ...s, ...tpl.settings }));
                }
              }}
              onDelete={(id) => {
                deleteTemplate(id);
                setTemplates(loadTemplates());
              }}
              onSave={(name) => {
                saveTemplate(name, form, settings);
                setTemplates(loadTemplates());
              }}
            />
          </PickerSection>

          <Disclaimer variant={disclaimerVariant} />
        </div>
      </div>
    </div>
  );
}

function FormFieldPrintCaption({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const { t } = useQrTranslations();
  return (
    <label className="block space-y-1 mb-3">
      <span className="text-xs font-medium text-gray-700">{t("printCaption")}</span>
      <input
        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

export interface QrGeneratorClientProps {
  initialType?: QrType;
  seoTitle?: string;
  seoDesc?: string;
  seoTitleKey?: string;
  seoDescKey?: string;
  disclaimerVariant?: "general" | "payment";
}

export default function QrGeneratorClient(props: QrGeneratorClientProps) {
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
              locale === opt.id
                ? "bg-gray-900 text-white"
                : "text-gray-500 hover:text-gray-800"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <QrGeneratorInner {...props} />
    </QrI18nProvider>
  );
}
