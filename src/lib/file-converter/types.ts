export type FileCategory =
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "spreadsheet"
  | "ebook"
  | "unknown";

export type DeviceType = "iphone" | "android" | "desktop";

export interface ImageMetadata {
  width: number;
  height: number;
  hasExif: boolean;
}

export interface VideoMetadata {
  duration?: number;
  width?: number;
  height?: number;
  codec?: string;
}

export interface AudioMetadata {
  duration?: number;
  bitrate?: number;
  codec?: string;
}

export interface PdfMetadata {
  pageCount: number;
}

export interface SpreadsheetMetadata {
  sheetCount: number;
  sheetNames: string[];
}

export interface EbookMetadata {
  title?: string;
  author?: string;
  format: string;
  hasCover: boolean;
  hasDrm: boolean;
}

export interface FileMetadata {
  image?: ImageMetadata;
  video?: VideoMetadata;
  audio?: AudioMetadata;
  pdf?: PdfMetadata;
  spreadsheet?: SpreadsheetMetadata;
  ebook?: EbookMetadata;
}

export interface FileAnalysis {
  file: File;
  name: string;
  extension: string;
  mimeType: string;
  category: FileCategory;
  size: number;
  sizeLabel: string;
  canProcess: boolean;
  processBlockReason?: string;
  metadata: FileMetadata;
  deviceType: DeviceType;
  /** Битая кодировка в имени файла или ID3-тегах (title/artist) */
  filenameEncodingIssue?: boolean;
}

export type ActionId =
  | "image-to-jpg"
  | "image-to-png"
  | "image-to-webp"
  | "image-to-avif"
  | "image-to-ico"
  | "image-compress"
  | "image-remove-exif"
  | "image-resize"
  | "video-to-mp3"
  | "video-to-webm"
  | "video-to-gif"
  | "video-compress"
  | "video-resize"
  | "audio-to-mp3"
  | "audio-to-aac"
  | "audio-to-wav"
  | "audio-to-flac"
  | "audio-to-ogg"
  | "audio-change-bitrate"
  | "audio-fix-filename"
  | "pdf-to-txt"
  | "pdf-to-jpg"
  | "pdf-to-png"
  | "xlsx-to-csv"
  | "csv-to-xlsx"
  | "xlsx-to-json"
  | "json-to-xlsx"
  | "epub-to-pdf"
  | "epub-to-txt"
  | "epub-cover"
  | "fb2-to-epub"
  | "fb2-to-pdf"
  | "fb2-to-txt"
  | "mobi-to-epub"
  | "mobi-to-pdf"
  | "txt-to-epub";

export interface SmartAction {
  id: ActionId;
  label: string;
  description: string;
  recommended?: boolean;
  icon: string;
}

export interface QuickAction {
  id: ActionId;
  label: string;
  description: string;
  icon: string;
  hintExtension?: string;
  hintMime?: string;
}

export interface ProcessProgress {
  stage: string;
  percent: number;
  message: string;
}

export interface ProcessResult {
  blob: Blob;
  filename: string;
  mimeType: string;
  size: number;
}

export interface ValidationResult {
  ok: boolean;
  message?: string;
}

export type TabId = "converter" | "pwa-icons";
