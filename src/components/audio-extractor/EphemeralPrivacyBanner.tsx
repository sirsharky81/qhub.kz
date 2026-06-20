"use client";

import { useAudioExtractorT } from "@/lib/audio-extractor/i18n";

export function EphemeralPrivacyBanner() {
  const { t } = useAudioExtractorT();
  return (
    <div className="flex items-start gap-2.5 text-sm text-sky-800 bg-sky-50 border border-sky-200 rounded-xl px-4 py-3">
      <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <p className="leading-snug">{t("privacy")}</p>
    </div>
  );
}
