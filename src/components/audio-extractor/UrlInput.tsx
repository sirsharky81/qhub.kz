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
  const canUseClipboard = typeof navigator !== "undefined" && !!navigator.clipboard?.readText;

  return (
    <div className="flex flex-col sm:flex-row gap-2">
      <input
        type="text"
        inputMode="url"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && consented && value.trim() && !loading) onSubmit();
        }}
        placeholder={t("urlPlaceholder")}
        disabled={loading}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10 disabled:opacity-50"
        style={{ fontSize: "16px" }}
        aria-label={t("urlPlaceholder")}
      />
      <button
        type="button"
        onClick={() => {
          if (!canUseClipboard) return;
          void navigator.clipboard.readText().then((text) => {
            if (text?.trim()) onChange(text.trim());
          }).catch(() => {});
        }}
        disabled={loading || !canUseClipboard}
        className="px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Вставить
      </button>
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
