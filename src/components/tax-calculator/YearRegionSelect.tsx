"use client";

import { AVAILABLE_YEARS } from "@/lib/tax-calculator/rules";
import { REGIONS } from "@/lib/tax-calculator/rules/regions";
import { t } from "@/lib/tax-calculator/i18n";
import type { Lang } from "@/lib/tax-calculator/types";

interface YearRegionSelectProps {
  year: string;
  regionId: string;
  lang: Lang;
  inputClass: string;
  labelClass: string;
  onYearChange: (year: string) => void;
  onRegionChange: (regionId: string) => void;
}

export default function YearRegionSelect({
  year,
  regionId,
  lang,
  inputClass,
  labelClass,
  onYearChange,
  onRegionChange,
}: YearRegionSelectProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <label className={labelClass}>{t(lang, "lbl.year")}</label>
        <select value={year} onChange={(e) => onYearChange(e.target.value)} className={inputClass}>
          {AVAILABLE_YEARS.map((y) => (
            <option key={y} value={String(y)}>
              {y}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelClass}>{t(lang, "lbl.region")}</label>
        <select value={regionId} onChange={(e) => onRegionChange(e.target.value)} className={inputClass}>
          {REGIONS.map((r) => (
            <option key={r.id} value={r.id}>
              {t(lang, r.labelKey)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
