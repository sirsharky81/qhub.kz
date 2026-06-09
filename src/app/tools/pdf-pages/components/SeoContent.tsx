"use client";

import { useTranslations } from "next-intl";

export function SeoContent() {
  const t = useTranslations("seo");

  return (
    <article className="max-w-3xl mx-auto px-4 py-12 border-t border-gray-100">
      <h2 className="text-xl font-bold text-gray-900 mb-4">{t("introTitle")}</h2>
      <p className="text-sm text-gray-600 leading-relaxed mb-6">{t("intro")}</p>

      <h2 className="text-lg font-semibold text-gray-900 mb-3">{t("howToDeleteTitle")}</h2>
      <p className="text-sm text-gray-600 leading-relaxed mb-4">{t("howToDelete")}</p>
      <ul className="list-disc list-inside text-sm text-gray-600 space-y-1 mb-6">
        <li>{t("howToDeleteStep1")}</li>
        <li>{t("howToDeleteStep2")}</li>
        <li>{t("howToDeleteStep3")}</li>
      </ul>

      <h2 className="text-lg font-semibold text-gray-900 mb-3">{t("howToReorderTitle")}</h2>
      <p className="text-sm text-gray-600 leading-relaxed mb-6">{t("howToReorder")}</p>

      <h2 className="text-lg font-semibold text-gray-900 mb-3">{t("howToMergeTitle")}</h2>
      <p className="text-sm text-gray-600 leading-relaxed mb-4">{t("howToMerge")}</p>
      <ul className="list-disc list-inside text-sm text-gray-600 space-y-1 mb-6">
        <li>{t("howToMergeStep1")}</li>
        <li>{t("howToMergeStep2")}</li>
        <li>{t("howToMergeStep3")}</li>
      </ul>

      <h2 className="text-lg font-semibold text-gray-900 mb-3">{t("howToSplitTitle")}</h2>
      <p className="text-sm text-gray-600 leading-relaxed mb-4">{t("howToSplit")}</p>
      <ul className="list-disc list-inside text-sm text-gray-600 space-y-1 mb-6">
        <li>{t("howToSplitStep1")}</li>
        <li>{t("howToSplitStep2")}</li>
      </ul>

      <h2 className="text-lg font-semibold text-gray-900 mb-3">{t("securityTitle")}</h2>
      <p className="text-sm text-gray-600 leading-relaxed">{t("security")}</p>
    </article>
  );
}
