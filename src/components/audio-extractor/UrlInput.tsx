"use client";

import { useAudioExtractorT } from "@/lib/audio-extractor/i18n";

interface UrlInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  consented?: boolean;
  loading?: boolean;
}

export function UrlInput({ value, onChange, onSubmit, consented = false, loading }: UrlInputProps) {
  const { t } = useAudioExtractorT();

  return (
    <div className="flex flex-col sm:flex-row gap-2">
      <input
        type="url"
        inputMode="url"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && consented && value.trim() && !loading) onSubmit();
        }}
        placeholder={t("urlPlaceholder")}
        disabled={loading}
        className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10 disabled:opacity-50"
        aria-label={t("urlPlaceholder")}
      />
      <button
        type="button"
        onClick={onSubmit}
        disabled={!consented || loading || !value.trim()}
        className="px-5 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? t("loadingMetadata") : t("extract")}
      </button>
    </div>
  );
}
