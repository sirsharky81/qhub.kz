"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { QrFormData, QrSettings, QrType, LabelOptions, QrHistoryEntry, QrTemplate } from "@/lib/qr-generator/types";
import { DEFAULT_SETTINGS, DEFAULT_LABEL_OPTIONS } from "@/lib/qr-generator/types";
import {
  getStorageDisplayTitle,
  getStorageIdentifier,
  getInventoryDisplayTitle,
  getInventoryIdentifier,
} from "@/lib/qr-generator/storageSerializers";
import { renderCode128DataUrl } from "@/lib/qr-generator/barcode";
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
import { FormField, compactInputClass } from "./components/FormField";
import { LabelOptionsPanel } from "./components/LabelOptionsPanel";
import { InventoryModeSelector, type InventoryMode } from "./components/InventoryModeSelector";
import InventoryBatchClient from "./inventory/InventoryBatchClient";

interface QrGeneratorInnerProps {
  initialType?: QrType;
  seoTitle?: string;
  seoDesc?: string;
  seoTitleKey?: string;
  seoDescKey?: string;
  disclaimerVariant?: "general" | "payment";
  hideNav?: boolean;
  embedded?: boolean;
}

function QrGeneratorInner({
  initialType = "text",
  seoTitle,
  seoDesc,
  seoTitleKey,
  seoDescKey,
  disclaimerVariant = "general",
  hideNav = false,
}: QrGeneratorInnerProps) {
  const { t } = useQrTranslations();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isInventoryPage = pathname.endsWith("/inventory");

  const [form, setForm] = useState<QrFormData>(() => emptyForm(initialType));
  const [inventoryMode, setInventoryMode] = useState<InventoryMode>("single");
  const [settings, setSettings] = useState<QrSettings>(DEFAULT_SETTINGS);
  const [printCaption, setPrintCaption] = useState("");
  const [history, setHistory] = useState<QrHistoryEntry[]>([]);
  const [templates, setTemplates] = useState<QrTemplate[]>([]);
  const [shareToast, setShareToast] = useState(false);
  const [labelOptions, setLabelOptions] = useState<LabelOptions>(DEFAULT_LABEL_OPTIONS);
  const [barcodeDataUrl, setBarcodeDataUrl] = useState<string | null>(null);

  const isInventoryBatch = form.type === "inventory" && inventoryMode === "batch";
  const isLabelType =
    (form.type === "storage" || form.type === "inventory") && !isInventoryBatch;
  const miniLabel = labelOptions.labelFormat.startsWith("mini-");

  const { result, generating } = useQRCode(form, settings);

  useEffect(() => {
    setHistory(loadHistory());
    setTemplates(loadTemplates());
  }, []);

  useEffect(() => {
    const parsed = parseFromUrl(searchParams.toString());
    if (parsed.form) setForm(parsed.form);
    else {
      const typeParam = searchParams.get("type") as QrType | null;
      if (typeParam && typeParam !== initialType) {
        setForm(emptyForm(typeParam));
      }
    }
    if (Object.keys(parsed.settings).length > 0) {
      setSettings((s) => ({ ...s, ...parsed.settings }));
    }
  }, [searchParams, initialType]);

  useEffect(() => {
    if (form.type !== "inventory" && initialType !== "inventory") return;
    const legacyTab = searchParams.get("tab");
    const modeParam = searchParams.get("mode") ?? (legacyTab === "batch" ? "batch" : "single");
    setInventoryMode(modeParam === "batch" ? "batch" : "single");
  }, [searchParams, form.type, initialType]);

  useEffect(() => {
    if (!isLabelType || labelOptions.codeType === "qr") {
      setBarcodeDataUrl(null);
      return;
    }
    const id =
      form.type === "storage"
        ? getStorageIdentifier(form.data)
        : getInventoryIdentifier(form.data);
    if (!id) {
      setBarcodeDataUrl(null);
      return;
    }
    let cancelled = false;
    void renderCode128DataUrl(id).then((url) => {
      if (!cancelled) setBarcodeDataUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [form, isLabelType, labelOptions.codeType]);

  const labelMeta = useMemo(() => {
    if (form.type === "storage") {
      return {
        identifier: getStorageIdentifier(form.data),
        title: getStorageDisplayTitle(form.data),
      };
    }
    if (form.type === "inventory") {
      return {
        identifier: getInventoryIdentifier(form.data),
        title: getInventoryDisplayTitle(form.data),
      };
    }
    return { identifier: "", title: "" };
  }, [form]);

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
    if (type !== "inventory") setInventoryMode("single");
  };

  const handleInventoryModeChange = useCallback(
    (mode: InventoryMode) => {
      setInventoryMode(mode);
      if (!isInventoryPage) return;
      router.replace(
        mode === "batch" ? "/tools/qr-generator/inventory?mode=batch" : "/tools/qr-generator/inventory",
        { scroll: false },
      );
    },
    [isInventoryPage, router],
  );

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
        <div className="max-w-2xl mx-auto px-4 py-4 space-y-3">
          <div className="space-y-0.5">
            <h1 className="text-lg font-bold text-gray-900 tracking-tight">
              {seoTitle ?? (seoTitleKey ? t(seoTitleKey) : t("title"))}
            </h1>
            <p className="text-xs text-gray-500">
              {seoDesc ?? (seoDescKey ? t(seoDescKey) : t("subtitle"))}
            </p>
            <PrivacyBanner compact />
            {!hideNav && (
              <div className="pt-2 space-y-1.5">
                <p className="text-[11px] font-medium text-gray-500">{t("seoScenarios")}</p>
                <ScenarioLinks />
              </div>
            )}
          </div>

          {shareToast && (
            <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5 text-center">
              {t("shareCopied")}
            </p>
          )}

          <PickerSection title={t("typeLabel")} hint={typeHint(form.type, t)} compact>
            <TypeSelector value={form.type} onChange={handleTypeChange} />
            {form.type === "inventory" && (
              <InventoryModeSelector mode={inventoryMode} onChange={handleInventoryModeChange} />
            )}
            {isInventoryBatch ? (
              <InventoryBatchClient embedded />
            ) : (
              <TypeForm form={form} onChange={setForm} miniLabel={miniLabel} />
            )}
          </PickerSection>

          {isLabelType && (
            <PickerSection title={t("label.options")} compact>
              <LabelOptionsPanel options={labelOptions} onChange={setLabelOptions} />
            </PickerSection>
          )}

          {!isInventoryBatch && (
            <>
              <PickerSection title={t("preview")} compact>
                <QRPreview
                  result={result}
                  generating={generating}
                  printCaption={effectivePrintCaption}
                  labelIdentifier={isLabelType ? labelMeta.identifier : undefined}
                  labelTitle={isLabelType ? labelMeta.title : undefined}
                  barcodeDataUrl={barcodeDataUrl}
                  codeType={isLabelType ? labelOptions.codeType : "qr"}
                  labelFormat={isLabelType ? labelOptions.labelFormat : "standard"}
                  showLabelText={isLabelType}
                />
              </PickerSection>

              <PickerSection title={t("settings")} compact>
                <SettingsPanel settings={settings} onChange={setSettings} />
              </PickerSection>

              <PickerSection title={t("export")} compact>
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
              labelPrintEnabled={isLabelType}
              labelPrintDisabled={!labelMeta.identifier}
            />
              </PickerSection>

              <PickerSection title={t("history")} compact>
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

              <PickerSection title={t("templates")} compact>
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
            </>
          )}

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
    <FormField label={t("printCaption")} compact className="mb-2">
      <input
        className={compactInputClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </FormField>
  );
}

export interface QrGeneratorClientProps {
  initialType?: QrType;
  seoTitle?: string;
  seoDesc?: string;
  seoTitleKey?: string;
  seoDescKey?: string;
  disclaimerVariant?: "general" | "payment";
  hideNav?: boolean;
  embedded?: boolean;
}

export default function QrGeneratorClient(props: QrGeneratorClientProps) {
  const [locale, setLocale] = useState<QrLocale>("ru");

  if (props.embedded) {
    return <QrGeneratorInner {...props} />;
  }

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
