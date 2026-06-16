"use client";

import { LEGAL_DISCLAIMER, LEGAL_CONSENT_TEXT } from "@/lib/random-picker";

interface LegalConsentProps {
  visible: boolean;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function LegalConsent({ visible, checked, onChange }: LegalConsentProps) {
  return (
    <div className="space-y-3">
      {visible && (
        <label
          htmlFor="legal-consent"
          className="flex items-start gap-3 cursor-pointer rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-4"
        >
          <input
            id="legal-consent"
            type="checkbox"
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-amber-900 dark:text-amber-100 leading-snug">
            {LEGAL_CONSENT_TEXT}
          </span>
        </label>
      )}

      <details className="text-xs text-gray-500 dark:text-gray-400">
        <summary className="cursor-pointer hover:text-gray-700 dark:hover:text-gray-300">
          Юридическая оговорка
        </summary>
        <p className="mt-2 leading-relaxed">{LEGAL_DISCLAIMER}</p>
      </details>
    </div>
  );
}
