"use client";

import { useState } from "react";
import { t } from "@/lib/tax-calculator/i18n";
import type { Lang, RegimeId } from "@/lib/tax-calculator/types";

interface CalculationExplainerProps {
  regime: RegimeId;
  lang: Lang;
}

const EXPLAINER_KEYS: Record<RegimeId, string> = {
  simplified: "explainer.simplified",
  general: "explainer.general",
  self_employed: "explainer.self_employed",
  kfh: "explainer.kfh",
};

export default function CalculationExplainer({ regime, lang }: CalculationExplainerProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-gray-100 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
      >
        {t(lang, "explainer.title")}
        <span className="text-gray-400 text-lg leading-none">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 text-sm text-gray-600 leading-relaxed border-t border-gray-50 pt-3">
          {t(lang, EXPLAINER_KEYS[regime])}
        </div>
      )}
    </div>
  );
}
