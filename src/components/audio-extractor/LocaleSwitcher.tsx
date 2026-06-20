"use client";

import { useAudioExtractorT } from "@/lib/audio-extractor/i18n";

interface LocaleSwitcherProps {
  locale: "ru" | "kk" | "en";
  onChange: (locale: "ru" | "kk" | "en") => void;
}

export function LocaleSwitcher({ locale, onChange }: LocaleSwitcherProps) {
  const options: { value: "ru" | "kk" | "en"; label: string }[] = [
    { value: "ru", label: "RU" },
    { value: "kk", label: "KK" },
    { value: "en", label: "EN" },
  ];

  return (
    <div className="flex gap-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={[
            "px-2 py-0.5 text-[10px] font-semibold rounded-md border",
            locale === opt.value
              ? "bg-gray-900 text-white border-gray-900"
              : "bg-white text-gray-500 border-gray-200 hover:border-gray-400",
          ].join(" ")}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function AudioExtractorHeader() {
  const { t, locale, setLocale } = useAudioExtractorT();
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h1 className="text-lg font-bold text-gray-900">{t("title")}</h1>
        <p className="text-sm text-gray-500 mt-0.5">{t("subtitle")}</p>
      </div>
      <LocaleSwitcher locale={locale} onChange={setLocale} />
    </div>
  );
}
