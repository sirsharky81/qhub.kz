import type { ActionId, FileAnalysis, QuickAction, SmartAction } from "./types";

export const QUICK_ACTIONS: QuickAction[] = [
  { id: "image-to-jpg", label: "HEIC → JPG", description: "iPhone фото", icon: "📷", hintExtension: "heic" },
  { id: "image-to-webp", label: "PNG → WebP", description: "Сжатие без потерь", icon: "🖼️", hintExtension: "png" },
  { id: "image-to-webp", label: "JPG → WebP", description: "Меньший размер", icon: "🖼️", hintExtension: "jpg" },
  { id: "video-to-mp3", label: "Видео → MP3", description: "Извлечь аудио", icon: "🎵", hintExtension: "mp4" },
  { id: "video-to-gif", label: "MP4 → GIF", description: "10 сек анимация", icon: "🎬", hintExtension: "mp4" },
  { id: "video-compress", label: "Сжать видео", description: "Меньше размер", icon: "📉", hintExtension: "mp4" },
  { id: "pdf-to-jpg", label: "PDF → JPG", description: "Страницы в фото", icon: "📄", hintExtension: "pdf" },
  { id: "pdf-to-txt", label: "PDF → TXT", description: "Извлечь текст", icon: "📝", hintExtension: "pdf" },
  { id: "xlsx-to-csv", label: "XLSX → CSV", description: "Для аналитики", icon: "📊", hintExtension: "xlsx" },
  { id: "epub-to-pdf", label: "EPUB → PDF", description: "Читалка PDF", icon: "📚", hintExtension: "epub" },
  { id: "fb2-to-epub", label: "FB2 → EPUB", description: "Универсальный формат", icon: "📖", hintExtension: "fb2" },
];

const IMAGE_ACTIONS: SmartAction[] = [
  { id: "image-to-jpg", label: "Конвертировать в JPG", description: "Универсальный формат", recommended: true, icon: "🖼️" },
  { id: "image-to-png", label: "Конвертировать в PNG", description: "Без потери качества", icon: "🖼️" },
  { id: "image-to-webp", label: "Конвертировать в WebP", description: "Компактный формат", icon: "🖼️" },
  { id: "image-to-avif", label: "Конвертировать в AVIF", description: "Современное сжатие", icon: "🖼️" },
  { id: "image-to-ico", label: "Создать ICO", description: "Иконка сайта", icon: "📌" },
  { id: "image-remove-exif", label: "Удалить EXIF", description: "Скрыть геолокацию", icon: "🔒" },
  { id: "image-compress", label: "Сжать изображение", description: "Уменьшить размер", icon: "📉" },
];

const VIDEO_ACTIONS: SmartAction[] = [
  { id: "video-to-mp3", label: "Извлечь аудио MP3", description: "Сохранить только звук", recommended: true, icon: "🎵" },
  { id: "video-compress", label: "Сжать видео", description: "Меньше размер файла", recommended: true, icon: "📉" },
  { id: "video-to-webm", label: "Конвертировать в WebM", description: "Для веба", icon: "🎬" },
  { id: "video-to-gif", label: "Создать GIF", description: "До 10 сек, 480px", icon: "✨" },
];

const AUDIO_ACTIONS: SmartAction[] = [
  { id: "audio-fix-filename", label: "Исправить имя файла", description: "Имя файла и название в плеере (ID3): CP1251/UTF-8 → читаемый текст", recommended: true, icon: "🔤" },
  { id: "audio-to-mp3", label: "Конвертировать в MP3", description: "Имя файла исправляется автоматически", recommended: true, icon: "🎵" },
  { id: "audio-to-wav", label: "Конвертировать в WAV", description: "Без сжатия", icon: "🎵" },
  { id: "audio-to-aac", label: "Конвертировать в AAC", description: "Для Apple", icon: "🎵" },
  { id: "audio-to-flac", label: "Конвертировать в FLAC", description: "Без потерь", icon: "🎵" },
  { id: "audio-to-ogg", label: "Конвертировать в OGG", description: "Открытый формат", icon: "🎵" },
  { id: "audio-change-bitrate", label: "Изменить битрейт", description: "192 kbps MP3", icon: "⚙️" },
];

const PDF_ACTIONS: SmartAction[] = [
  { id: "pdf-to-txt", label: "Извлечь текст", description: "Скопировать содержимое", recommended: true, icon: "📝" },
  { id: "pdf-to-jpg", label: "Страницы в JPG", description: "Каждая страница — фото", icon: "🖼️" },
  { id: "pdf-to-png", label: "Страницы в PNG", description: "Без потери качества", icon: "🖼️" },
];

const SPREADSHEET_ACTIONS: SmartAction[] = [
  { id: "xlsx-to-csv", label: "XLSX → CSV", description: "Для Excel и аналитики", recommended: true, icon: "📊" },
  { id: "xlsx-to-json", label: "XLSX → JSON", description: "Для разработки", icon: "📊" },
  { id: "csv-to-xlsx", label: "CSV → XLSX", description: "Открыть в Excel", icon: "📊" },
  { id: "json-to-xlsx", label: "JSON → XLSX", description: "Таблица из данных", icon: "📊" },
];

function ebookActions(analysis: FileAnalysis): SmartAction[] {
  const ext = analysis.extension;
  const actions: SmartAction[] = [];

  if (ext === "epub") {
    actions.push(
      { id: "epub-to-pdf", label: "Конвертировать в PDF", description: "Для печати и чтения", recommended: true, icon: "📚" },
      { id: "epub-to-txt", label: "Конвертировать в TXT", description: "Только текст", recommended: true, icon: "📝" },
      { id: "epub-cover", label: "Извлечь обложку", description: "Сохранить cover", icon: "🖼️" },
    );
  } else if (ext === "fb2") {
    actions.push(
      { id: "fb2-to-epub", label: "Конвертировать в EPUB", description: "Универсальный формат", recommended: true, icon: "📖" },
      { id: "fb2-to-pdf", label: "Конвертировать в PDF", description: "Текстовый PDF", icon: "📄" },
      { id: "fb2-to-txt", label: "Извлечь текст", description: "Без разметки", icon: "📝" },
    );
  } else if (ext === "mobi" || ext === "azw3") {
    actions.push(
      { id: "mobi-to-epub", label: "Конвертировать в EPUB", description: "Базовая конвертация", recommended: true, icon: "📖" },
      { id: "mobi-to-pdf", label: "Конвертировать в PDF", description: "Текстовый PDF", icon: "📄" },
    );
  } else if (ext === "txt") {
    actions.push(
      { id: "txt-to-epub", label: "Создать EPUB", description: "Электронная книга", recommended: true, icon: "📚" },
    );
  }

  return actions;
}

export function getSmartActions(analysis: FileAnalysis): SmartAction[] {
  let actions: SmartAction[];
  switch (analysis.category) {
    case "image":
      actions = prioritizeHeic(analysis, IMAGE_ACTIONS);
      break;
    case "video":
      actions = VIDEO_ACTIONS;
      break;
    case "audio":
      actions = prioritizeBrokenFilename(analysis, AUDIO_ACTIONS);
      break;
    case "pdf":
      actions = PDF_ACTIONS;
      break;
    case "spreadsheet":
      actions = filterSpreadsheetActions(analysis, SPREADSHEET_ACTIONS);
      break;
    case "ebook":
      actions = ebookActions(analysis);
      break;
    default:
      actions = [];
  }
  return actions;
}

function prioritizeBrokenFilename(analysis: FileAnalysis, actions: SmartAction[]): SmartAction[] {
  if (!analysis.filenameEncodingIssue) return actions;
  return actions.map((a) =>
    a.id === "audio-fix-filename"
      ? { ...a, recommended: true }
      : a.id === "audio-to-mp3"
        ? { ...a, recommended: false }
        : a,
  );
}

function prioritizeHeic(analysis: FileAnalysis, actions: SmartAction[]): SmartAction[] {
  if (analysis.extension === "heic" || analysis.extension === "heif") {
    return actions.map((a) =>
      a.id === "image-to-jpg" ? { ...a, recommended: true } : { ...a, recommended: false },
    );
  }
  return actions;
}

function filterSpreadsheetActions(analysis: FileAnalysis, actions: SmartAction[]): SmartAction[] {
  const ext = analysis.extension;
  return actions.filter((a) => {
    if (ext === "xlsx" || ext === "xls") {
      return ["xlsx-to-csv", "xlsx-to-json"].includes(a.id);
    }
    if (ext === "csv") return a.id === "csv-to-xlsx";
    if (ext === "json") return a.id === "json-to-xlsx";
    return true;
  });
}

export function getActionById(id: ActionId): QuickAction | undefined {
  return QUICK_ACTIONS.find((a) => a.id === id);
}
