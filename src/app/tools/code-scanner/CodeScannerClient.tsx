"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { CodeScannerI18nProvider, LOCALE_OPTIONS, useCodeScannerT } from "@/lib/code-scanner/i18n";
import type { ScanMode } from "@/lib/code-scanner/types";
import { PrivacyBanner } from "../file-converter/components/PrivacyBanner";
import ModeSelector from "./components/ModeSelector";
import SimpleScanView from "./components/SimpleScanView";
import StorageScanView from "./components/StorageScanView";
import InventoryView from "./components/InventoryView";

function parseInitialMode(value: string | null): ScanMode | null {
  if (value === "simple" || value === "storage" || value === "inventory") return value;
  return null;
}

function CodeScannerInner() {
  const { t, locale, setLocale } = useCodeScannerT();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<ScanMode | null>(() =>
    parseInitialMode(searchParams.get("mode")),
  );

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3 print:hidden">
        <div className="min-w-0">
          <h1 className="text-base sm:text-lg font-semibold text-gray-900 truncate">{t("title")}</h1>
          <p className="text-xs text-gray-500 truncate">{t("subtitle")}</p>
        </div>
        <div className="flex gap-1 shrink-0">
          {LOCALE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setLocale(opt.id)}
              className={`px-2 py-1 text-[10px] rounded-md border ${locale === opt.id ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 text-gray-600"}`}
            >
              {t(opt.labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 max-w-3xl mx-auto w-full">
        <PrivacyBanner compact />

        {!mode && (
          <>
            <ModeSelector onSelect={setMode} />
          </>
        )}

        {mode === "simple" && <SimpleScanView onBack={() => setMode(null)} />}
        {mode === "storage" && <StorageScanView onBack={() => setMode(null)} />}
        {mode === "inventory" && <InventoryView onBack={() => setMode(null)} />}
      </div>
    </div>
  );
}

export default function CodeScannerClient() {
  return (
    <CodeScannerI18nProvider>
      <CodeScannerInner />
    </CodeScannerI18nProvider>
  );
}
