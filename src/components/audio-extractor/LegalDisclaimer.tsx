"use client";

import { CONSENT_STORAGE_KEY } from "@/lib/audio-extractor/constants";
import { useAudioExtractorT } from "@/lib/audio-extractor/i18n";

interface LegalDisclaimerProps {
  consented: boolean;
  onConsentChange: (value: boolean) => void;
}

export function LegalDisclaimer({ consented, onConsentChange }: LegalDisclaimerProps) {
  const { t } = useAudioExtractorT();

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 space-y-2">
      <p className="text-sm font-semibold text-amber-900">{t("disclaimerTitle")}</p>
      <p className="text-xs leading-relaxed text-amber-800">{t("disclaimerBody")}</p>
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={consented}
          onChange={(e) => {
            const checked = e.target.checked;
            onConsentChange(checked);
            if (checked) {
              sessionStorage.setItem(CONSENT_STORAGE_KEY, "1");
            } else {
              sessionStorage.removeItem(CONSENT_STORAGE_KEY);
            }
          }}
          className="mt-0.5 rounded border-amber-300"
        />
        <span className="text-xs text-amber-900">{t("consentLabel")}</span>
      </label>
    </div>
  );
}

export function readStoredConsent(): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(CONSENT_STORAGE_KEY) === "1";
}
