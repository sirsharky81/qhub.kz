"use client";

import { BENEFIT_RULES } from "@/lib/tax-calculator/rules/benefits";
import { t } from "@/lib/tax-calculator/i18n";
import type { BenefitId, Lang } from "@/lib/tax-calculator/types";

interface BenefitsChipsProps {
  benefits: BenefitId[];
  disabledChildrenCount: string;
  lang: Lang;
  labelClass: string;
  inputClass: string;
  onToggle: (id: BenefitId) => void;
  onChildrenChange: (count: string) => void;
}

export default function BenefitsChips({
  benefits,
  disabledChildrenCount,
  lang,
  labelClass,
  inputClass,
  onToggle,
  onChildrenChange,
}: BenefitsChipsProps) {
  return (
    <div>
      <label className={labelClass}>{t(lang, "lbl.benefits")}</label>
      <div className="flex flex-wrap gap-2">
        {BENEFIT_RULES.map((b) => {
          const active = benefits.includes(b.id);
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => onToggle(b.id)}
              title={t(lang, b.descriptionKey)}
              className={
                "px-3 py-1.5 text-xs sm:text-sm rounded-lg border transition-colors " +
                (active
                  ? "bg-purple-600 text-white border-purple-600"
                  : "border-gray-200 text-gray-700 hover:border-purple-300 hover:bg-purple-50")
              }
            >
              {t(lang, b.labelKey)}
            </button>
          );
        })}
      </div>
      {benefits.includes("parent_disabled_child") && (
        <div className="mt-3 max-w-[160px]">
          <label className={labelClass}>{t(lang, "lbl.children")}</label>
          <input
            type="number"
            min={1}
            max={10}
            value={disabledChildrenCount}
            onChange={(e) => onChildrenChange(e.target.value)}
            className={inputClass}
          />
        </div>
      )}
    </div>
  );
}
