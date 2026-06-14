import type { ActionId } from "./types";

export type CatalogCategoryId =
  | "all"
  | "photo"
  | "audio"
  | "video"
  | "data"
  | "books"
  | "documents"
  | "archive"
  | "other";

export interface CatalogCategory {
  id: CatalogCategoryId;
  label: string;
  shortLabel?: string;
  icon: string;
}

export interface CatalogEntry {
  id: string;
  actionId?: ActionId;
  label: string;
  inputFormats: string;
  outputFormats: string;
  description: string;
  icon: string;
  category: Exclude<CatalogCategoryId, "all">;
  featured?: boolean;
  comingSoon?: boolean;
}

export const CATALOG_CATEGORIES: CatalogCategory[] = [
  { id: "all", label: "Все", icon: "✨" },
  { id: "photo", label: "Фото", icon: "🖼️" },
  { id: "audio", label: "Аудио", icon: "🎵" },
  { id: "video", label: "Видео", icon: "🎬" },
  { id: "data", label: "Таблица/Данные", shortLabel: "Данные", icon: "📊" },
  { id: "books", label: "Книги", icon: "📚" },
  { id: "documents", label: "Документы", shortLabel: "Докум.", icon: "📄" },
  { id: "archive", label: "Архив", icon: "📦" },
  { id: "other", label: "Прочие", icon: "⚙️" },
];

export const CONVERSION_CATALOG: CatalogEntry[] = [
  // Фото
  { id: "heic-jpg", actionId: "image-to-jpg", label: "HEIC → JPG", inputFormats: "HEIC, HEIF", outputFormats: "JPG", description: "iPhone фото в универсальный формат", icon: "📷", category: "photo", featured: true },
  { id: "png-webp", actionId: "image-to-webp", label: "PNG → WebP", inputFormats: "PNG", outputFormats: "WebP", description: "Меньший размер без видимой потери", icon: "🖼️", category: "photo", featured: true },
  { id: "jpg-webp", actionId: "image-to-webp", label: "JPG → WebP", inputFormats: "JPG, JPEG", outputFormats: "WebP", description: "Компактнее для сайта и мессенджеров", icon: "🖼️", category: "photo" },
  { id: "any-png", actionId: "image-to-png", label: "→ PNG", inputFormats: "JPG, WebP, HEIC, GIF", outputFormats: "PNG", description: "Без потери качества, с прозрачностью", icon: "🖼️", category: "photo" },
  { id: "any-jpg", actionId: "image-to-jpg", label: "→ JPG", inputFormats: "PNG, WebP, HEIC, BMP", outputFormats: "JPG", description: "Универсальный формат для всего", icon: "🖼️", category: "photo" },
  { id: "any-avif", actionId: "image-to-avif", label: "→ AVIF", inputFormats: "JPG, PNG, WebP", outputFormats: "AVIF", description: "Современное сжатие для веба", icon: "🖼️", category: "photo" },
  { id: "png-ico", actionId: "image-to-ico", label: "PNG → ICO", inputFormats: "PNG", outputFormats: "ICO", description: "Иконка для сайта", icon: "📌", category: "photo" },
  { id: "compress-img", actionId: "image-compress", label: "Сжать изображение", inputFormats: "JPG, PNG, WebP", outputFormats: "JPG/WebP", description: "Уменьшить размер файла", icon: "📉", category: "photo" },
  { id: "remove-exif", actionId: "image-remove-exif", label: "Удалить EXIF", inputFormats: "JPG, PNG, WebP", outputFormats: "тот же формат", description: "Скрыть геолокацию и метаданные", icon: "🔒", category: "photo" },

  // Аудио
  { id: "fix-mp3-name", actionId: "audio-fix-filename", label: "Исправить имя MP3", inputFormats: "MP3", outputFormats: "MP3", description: "Автоисправление битой кодировки (CP1251/UTF-8) и имя из ID3-тегов", icon: "🔤", category: "audio", featured: true },
  { id: "any-mp3", actionId: "audio-to-mp3", label: "→ MP3", inputFormats: "WAV, FLAC, M4A, AAC, OGG, AMR", outputFormats: "MP3", description: "Универсальный формат, имя исправляется автоматически", icon: "🎵", category: "audio", featured: true },
  { id: "mp3-wav", actionId: "audio-to-wav", label: "→ WAV", inputFormats: "MP3, M4A, FLAC, OGG", outputFormats: "WAV", description: "Без сжатия, для монтажа", icon: "🎵", category: "audio" },
  { id: "mp3-aac", actionId: "audio-to-aac", label: "→ AAC (M4A)", inputFormats: "MP3, WAV, FLAC", outputFormats: "M4A", description: "Для Apple-устройств", icon: "🎵", category: "audio" },
  { id: "mp3-flac", actionId: "audio-to-flac", label: "→ FLAC", inputFormats: "MP3, WAV, M4A", outputFormats: "FLAC", description: "Сжатие без потерь", icon: "🎵", category: "audio" },
  { id: "mp3-ogg", actionId: "audio-to-ogg", label: "→ OGG", inputFormats: "MP3, WAV, FLAC", outputFormats: "OGG", description: "Открытый формат", icon: "🎵", category: "audio" },
  { id: "bitrate", actionId: "audio-change-bitrate", label: "Изменить битрейт", inputFormats: "MP3, M4A, WAV", outputFormats: "MP3 192 kbps", description: "Уменьшить или стандартизировать качество", icon: "⚙️", category: "audio" },

  // Видео
  { id: "video-mp3", actionId: "video-to-mp3", label: "Видео → MP3", inputFormats: "MP4, MOV, WEBM, MKV", outputFormats: "MP3", description: "Извлечь аудиодорожку", icon: "🎵", category: "video", featured: true },
  { id: "video-gif", actionId: "video-to-gif", label: "MP4 → GIF", inputFormats: "MP4, MOV, WEBM", outputFormats: "GIF", description: "До 10 сек, 480px", icon: "✨", category: "video", featured: true },
  { id: "video-compress", actionId: "video-compress", label: "Сжать видео", inputFormats: "MP4, MOV, MKV", outputFormats: "MP4", description: "Меньше размер для отправки", icon: "📉", category: "video" },
  { id: "video-webm", actionId: "video-to-webm", label: "→ WebM", inputFormats: "MP4, MOV, AVI", outputFormats: "WebM", description: "Для веб-плееров", icon: "🎬", category: "video" },
  { id: "video-resize", actionId: "video-resize", label: "Уменьшить разрешение", inputFormats: "MP4, MOV", outputFormats: "MP4 720p", description: "1280px по ширине", icon: "📐", category: "video" },

  // Таблица/Данные
  { id: "xlsx-csv", actionId: "xlsx-to-csv", label: "XLSX → CSV", inputFormats: "XLSX, XLS", outputFormats: "CSV", description: "Для Excel, Python, аналитики", icon: "📊", category: "data", featured: true },
  { id: "csv-xlsx", actionId: "csv-to-xlsx", label: "CSV → XLSX", inputFormats: "CSV", outputFormats: "XLSX", description: "Открыть в Excel", icon: "📊", category: "data" },
  { id: "xlsx-json", actionId: "xlsx-to-json", label: "XLSX → JSON", inputFormats: "XLSX, XLS", outputFormats: "JSON", description: "Для разработки и API", icon: "📊", category: "data" },
  { id: "json-xlsx", actionId: "json-to-xlsx", label: "JSON → XLSX", inputFormats: "JSON", outputFormats: "XLSX", description: "Таблица из данных", icon: "📊", category: "data" },

  // Книги
  { id: "epub-pdf", actionId: "epub-to-pdf", label: "EPUB → PDF", inputFormats: "EPUB", outputFormats: "PDF", description: "Читать или печатать", icon: "📚", category: "books", featured: true },
  { id: "epub-txt", actionId: "epub-to-txt", label: "EPUB → TXT", inputFormats: "EPUB", outputFormats: "TXT", description: "Только текст", icon: "📝", category: "books" },
  { id: "epub-cover", actionId: "epub-cover", label: "Обложка EPUB", inputFormats: "EPUB", outputFormats: "JPG/PNG", description: "Извлечь cover", icon: "🖼️", category: "books" },
  { id: "fb2-epub", actionId: "fb2-to-epub", label: "FB2 → EPUB", inputFormats: "FB2", outputFormats: "EPUB", description: "Универсальный формат", icon: "📖", category: "books", featured: true },
  { id: "fb2-pdf", actionId: "fb2-to-pdf", label: "FB2 → PDF", inputFormats: "FB2", outputFormats: "PDF", description: "Текстовый PDF", icon: "📄", category: "books" },
  { id: "fb2-txt", actionId: "fb2-to-txt", label: "FB2 → TXT", inputFormats: "FB2", outputFormats: "TXT", description: "Извлечь текст", icon: "📝", category: "books" },
  { id: "mobi-epub", actionId: "mobi-to-epub", label: "MOBI → EPUB", inputFormats: "MOBI, AZW3", outputFormats: "EPUB", description: "Базовая конвертация", icon: "📖", category: "books" },
  { id: "mobi-pdf", actionId: "mobi-to-pdf", label: "MOBI → PDF", inputFormats: "MOBI, AZW3", outputFormats: "PDF", description: "Текстовый PDF", icon: "📄", category: "books" },
  { id: "txt-epub", actionId: "txt-to-epub", label: "TXT → EPUB", inputFormats: "TXT", outputFormats: "EPUB", description: "Создать электронную книгу", icon: "📚", category: "books" },

  // Документы
  { id: "pdf-txt", actionId: "pdf-to-txt", label: "PDF → TXT", inputFormats: "PDF", outputFormats: "TXT", description: "Извлечь текст", icon: "📝", category: "documents", featured: true },
  { id: "pdf-jpg", actionId: "pdf-to-jpg", label: "PDF → JPG", inputFormats: "PDF", outputFormats: "JPG / ZIP", description: "Каждая страница — изображение", icon: "🖼️", category: "documents", featured: true },
  { id: "pdf-png", actionId: "pdf-to-png", label: "PDF → PNG", inputFormats: "PDF", outputFormats: "PNG / ZIP", description: "Без потери качества", icon: "🖼️", category: "documents" },

  // Архив
  { id: "zip-extract", label: "ZIP → файлы", inputFormats: "ZIP", outputFormats: "файлы", description: "Распаковка архивов", icon: "📦", category: "archive", comingSoon: true },
  { id: "files-zip", label: "Файлы → ZIP", inputFormats: "любые", outputFormats: "ZIP", description: "Собрать архив", icon: "📦", category: "archive", comingSoon: true },

  // Прочие
  { id: "pwa-icons", label: "PWA иконки", inputFormats: "PNG 1024×1024", outputFormats: "ico, png, manifest", description: "Комплект иконок для PWA — вкладка «PWA иконки»", icon: "📱", category: "other" },
];

export function getCatalogByCategory(category: CatalogCategoryId): CatalogEntry[] {
  if (category === "all") return CONVERSION_CATALOG;
  return CONVERSION_CATALOG.filter((e) => e.category === category);
}

export function getCatalogEntry(id: string): CatalogEntry | undefined {
  return CONVERSION_CATALOG.find((e) => e.id === id);
}
