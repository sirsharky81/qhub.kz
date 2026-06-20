"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type AudioExtractorLocale = "ru" | "kk" | "en";

type Messages = Record<string, string>;

const ru: Messages = {
  title: "Audio Extractor",
  subtitle: "Извлечение аудиодорожки из YouTube",
  privacy:
    "Ссылка обрабатывается в вашем браузере. Аудио не сохраняется на сервере QHub.",
  privacyServer:
    "Ссылка обрабатывается на сервере только на время запроса. Аудио не сохраняется на сервере QHub.",
  urlPlaceholder: "Вставьте ссылку на YouTube…",
  extract: "Извлечь",
  extractAudio: "Извлечь аудио",
  cancel: "Отмена",
  loadingMetadata: "Получение информации…",
  loadingAudio: "Загрузка аудио…",
  duration: "Длительность",
  author: "Автор",
  platform: "Платформа",
  platformYoutube: "YouTube",
  platformTiktok: "TikTok",
  platformInstagram: "Instagram",
  durationWarning: "Извлечение может занять несколько минут",
  durationBlocked: "Видео длиннее 10 минут — извлечение недоступно",
  consentLabel: "Я понимаю ограничения и использую сервис только для личных целей",
  disclaimerTitle: "Важно",
  disclaimerBody:
    "Сервис предназначен для личного некоммерческого использования. Вы несёте ответственность за соблюдение авторских прав и правил YouTube. QHub не хранит и не распространяет контент. Извлечение DRM-защищённого контента запрещено.",
  saveResult: "Сохранить результат",
  download: "Скачать",
  exporting: "Экспорт…",
  play: "Воспроизвести",
  pause: "Пауза",
  now: "Сейчас",
  total: "Всего",
  back: "Назад",
  newLink: "Новая ссылка",
  errorInvalidUrl: "Некорректная ссылка",
  errorUnsupported: "Поддерживаются только ссылки YouTube",
  errorUnavailable: "Видео недоступно",
  errorTooLong: "Видео длиннее 10 минут",
  errorRateLimit: "Слишком много запросов. Попробуйте через час",
  errorGeneric: "Не удалось извлечь аудио",
  errorConsent: "Подтвердите согласие с ограничениями",
  errorService: "Сервис временно недоступен",
};

const kk: Messages = {
  ...ru,
  subtitle: "YouTube ссылkalarından аудио алу",
  urlPlaceholder: "YouTube сілтемесін қойыңыз…",
  extract: "Алу",
  extractAudio: "Аудионы алу",
  cancel: "Бас тарту",
  loadingMetadata: "Ақпарат алынуда…",
  loadingAudio: "Аудио жүктелуде…",
  duration: "Ұзақтығы",
  author: "Автор",
  platform: "Платформа",
  consentLabel: "Шектеулерді түсінемін және сервисті тек жеке мақсатта пайдаланамын",
  disclaimerTitle: "Маңызды",
  disclaimerBody:
    "Сервис тек жеке пайдалануға арналған. Авторлық құқық пен YouTube ережелерін сақтауға жауаптысыз. QHub контент сақтамайды.",
  saveResult: "Нәтижені сақтау",
  download: "Жүктеу",
  exporting: "Экспорт…",
  back: "Артқа",
  newLink: "Жаңа сілтеме",
};

const en: Messages = {
  ...ru,
  subtitle: "Extract audio from YouTube links",
  privacy:
    "The link is processed in your browser. Audio is not stored on QHub servers.",
  privacyServer:
    "The link is processed on the server only for the duration of the request. Audio is not stored on QHub servers.",
  urlPlaceholder: "Paste a YouTube link…",
  extract: "Extract",
  extractAudio: "Extract audio",
  cancel: "Cancel",
  loadingMetadata: "Fetching info…",
  loadingAudio: "Loading audio…",
  duration: "Duration",
  author: "Author",
  platform: "Platform",
  consentLabel: "I understand the limits and use this service for personal purposes only",
  disclaimerTitle: "Important",
  disclaimerBody:
    "This service is for personal non-commercial use. You are responsible for copyright and YouTube terms. QHub does not store or distribute content.",
  saveResult: "Save result",
  download: "Download",
  exporting: "Exporting…",
  back: "Back",
  newLink: "New link",
  errorInvalidUrl: "Invalid link",
  errorUnsupported: "Only YouTube links are supported",
  errorUnavailable: "Video unavailable",
  errorTooLong: "Video is longer than 10 minutes",
  errorRateLimit: "Too many requests. Try again in an hour",
  errorGeneric: "Could not extract audio",
  errorConsent: "Please accept the disclaimer",
  errorService: "Service temporarily unavailable",
};

const MESSAGES: Record<AudioExtractorLocale, Messages> = { ru, kk, en };

const LocaleContext = createContext<{
  locale: AudioExtractorLocale;
  setLocale: (locale: AudioExtractorLocale) => void;
  t: (key: string) => string;
} | null>(null);

export function AudioExtractorI18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<AudioExtractorLocale>("ru");
  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t: (key: string) => MESSAGES[locale][key] ?? MESSAGES.ru[key] ?? key,
    }),
    [locale],
  );
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useAudioExtractorT() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useAudioExtractorT must be used within AudioExtractorI18nProvider");
  return ctx;
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
