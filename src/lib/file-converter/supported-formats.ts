import type { FileCategory } from "./types";

/** Все расширения, которые сервис умеет обрабатывать */
export const SUPPORTED_EXTENSIONS = new Set([
  "jpg", "jpeg", "png", "webp", "heic", "heif", "avif", "gif", "bmp", "tiff", "tif", "ico",
  "mp4", "mov", "webm", "avi", "mkv", "m4v",
  "mp3", "aac", "m4a", "wav", "flac", "ogg", "opus", "amr",
  "pdf",
  "xlsx", "xls", "csv", "json",
  "epub", "fb2", "mobi", "azw3", "txt",
]);

const MIME_PREFIXES = ["image/", "video/", "audio/"];

const MIME_EXACT = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
  "application/json",
  "application/epub+zip",
  "application/x-fictionbook+xml",
  "application/x-mobipocket-ebook",
  "text/plain",
]);

export const FILE_ACCEPT =
  "image/*,video/*,audio/*,.heic,.heif,.avif,.webp,.jpg,.jpeg,.png,.gif,.bmp,.tiff,.tif,.ico," +
  ".mp4,.mov,.webm,.avi,.mkv,.m4v,.mp3,.wav,.m4a,.aac,.flac,.ogg,.opus,.amr," +
  ".pdf,.xlsx,.xls,.csv,.json,.epub,.fb2,.mobi,.azw3,.txt," +
  "application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet," +
  "application/vnd.ms-excel,text/csv,application/json,application/epub+zip,text/plain";

export const ACCEPT_IMAGE =
  "image/*,.heic,.heif,.jpg,.jpeg,.png,.webp,.gif,.bmp,.tiff,.tif,.ico,.avif";

export const ACCEPT_MEDIA =
  "video/*,audio/*,.mp4,.mov,.webm,.mkv,.avi,.m4v,.mp3,.wav,.m4a,.aac,.flac,.ogg,.opus,.amr";

export const ACCEPT_DOCUMENT =
  "application/pdf,.pdf";

export const ACCEPT_SPREADSHEET =
  ".xlsx,.xls,.csv,.json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet," +
  "application/vnd.ms-excel,text/csv,application/json";

export const ACCEPT_EBOOK =
  ".epub,.fb2,.mobi,.azw3,.txt,application/epub+zip,application/x-fictionbook+xml," +
  "application/x-mobipocket-ebook,text/plain";

export function getExtension(name: string): string {
  const match = name.match(/\.([^.]+)$/i);
  return match ? match[1].toLowerCase() : "";
}

export function isSupportedFile(file: File): boolean {
  const ext = getExtension(file.name);
  if (ext && SUPPORTED_EXTENSIONS.has(ext)) return true;

  const mime = file.type.toLowerCase();
  if (!mime || mime === "application/octet-stream") return ext ? SUPPORTED_EXTENSIONS.has(ext) : false;

  if (MIME_EXACT.has(mime)) return true;
  if (MIME_PREFIXES.some((p) => mime.startsWith(p))) return true;

  return false;
}

export function unsupportedFileMessage(file: File): string {
  const ext = getExtension(file.name);
  const label = ext ? `.${ext.toUpperCase()}` : file.type || "этот тип";
  return `Формат ${label} не поддерживается. Выберите файл из поддерживаемых: фото, видео, аудио, PDF, таблицы или книги.`;
}

export function acceptForCategory(category: FileCategory | "all"): string {
  switch (category) {
    case "image":
      return ACCEPT_IMAGE;
    case "video":
    case "audio":
      return ACCEPT_MEDIA;
    case "pdf":
      return ACCEPT_DOCUMENT;
    case "spreadsheet":
      return ACCEPT_SPREADSHEET;
    case "ebook":
      return ACCEPT_EBOOK;
    default:
      return FILE_ACCEPT;
  }
}

/** Accept для каталога по id категории */
export function acceptForCatalogCategory(
  category: "photo" | "audio" | "video" | "data" | "books" | "documents" | "archive" | "other" | "all",
): string {
  switch (category) {
    case "photo":
      return ACCEPT_IMAGE;
    case "audio":
    case "video":
      return ACCEPT_MEDIA;
    case "data":
      return ACCEPT_SPREADSHEET;
    case "books":
      return ACCEPT_EBOOK;
    case "documents":
      return ACCEPT_DOCUMENT;
    case "archive":
    case "other":
    case "all":
    default:
      return FILE_ACCEPT;
  }
}

export const SUPPORTED_FORMATS_HINT =
  "JPG, PNG, WebP, HEIC, MP4, MP3, PDF, XLSX, CSV, EPUB, FB2 и другие";
