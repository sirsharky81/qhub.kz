"use client";

import { t } from "@/lib/tax-calculator/i18n";
import type { Lang } from "@/lib/tax-calculator/types";
import TestingBadge from "@/components/TestingBadge";

interface TestingBannerProps {
  lang: Lang;
}

export default function TestingBanner({ lang }: TestingBannerProps) {
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 print:hidden"
    >
      <TestingBadge size="sm" className="mt-0.5 flex-shrink-0" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-amber-900">{t(lang, "beta.title")}</p>
        <p className="text-xs text-amber-800/90 mt-0.5 leading-relaxed">{t(lang, "beta.message")}</p>
      </div>
    </div>
  );
}
