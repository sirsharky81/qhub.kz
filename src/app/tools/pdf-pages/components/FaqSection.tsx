"use client";

import { useTranslations } from "next-intl";

const FAQ_COUNT = 8;

export function FaqSection() {
  const t = useTranslations("faq");

  return (
    <section className="max-w-3xl mx-auto px-4 py-12">
      <h2 className="text-xl font-bold text-gray-900 mb-6">{t("title")}</h2>
      <div className="space-y-3">
        {Array.from({ length: FAQ_COUNT }, (_, i) => {
          const n = i + 1;
          return (
            <details
              key={n}
              className="group border border-gray-200 rounded-xl bg-white overflow-hidden"
            >
              <summary className="px-4 py-3 text-sm font-medium text-gray-800 cursor-pointer hover:bg-gray-50 list-none flex items-center justify-between">
                {t(`q${n}`)}
                <span className="text-gray-400 group-open:rotate-180 transition-transform ml-2" aria-hidden>
                  ▾
                </span>
              </summary>
              <div className="px-4 pb-4 text-sm text-gray-600 leading-relaxed border-t border-gray-100 pt-3">
                {t(`a${n}`)}
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}
