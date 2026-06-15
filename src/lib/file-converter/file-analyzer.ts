import exifr from "exifr";
import { parseBlob } from "music-metadata";
import type {
  FileAnalysis,
  FileCategory,
  FileMetadata,
  EbookMetadata,
} from "./types";
import { checkSizeLimit, detectDeviceType, formatFileSize } from "./size-limits";
import { looksLikeBrokenEncoding } from "./filename-encoding";
import { initPdfWorker, loadPdfDocument } from "@/app/tools/_pdf-shared/pdfWorker";

const IMAGE_EXT = new Set([
  "jpg", "jpeg", "png", "webp", "heic", "heif", "avif", "gif", "bmp", "tiff", "tif", "ico",
]);
const VIDEO_EXT = new Set(["mp4", "mov", "webm", "avi", "mkv", "m4v"]);
const AUDIO_EXT = new Set(["mp3", "aac", "m4a", "wav", "flac", "ogg", "opus", "amr"]);
const PDF_EXT = new Set(["pdf"]);
const SPREADSHEET_EXT = new Set(["xlsx", "xls", "csv", "json"]);
const EBOOK_EXT = new Set(["epub", "fb2", "mobi", "azw3", "txt"]);

const MIME_MAP: Record<string, FileCategory> = {
  "image/jpeg": "image",
  "image/png": "image",
  "image/webp": "image",
  "image/heic": "image",
  "image/heif": "image",
  "image/avif": "image",
  "image/gif": "image",
  "image/bmp": "image",
  "image/tiff": "image",
  "image/x-icon": "image",
  "video/mp4": "video",
  "video/quicktime": "video",
  "video/webm": "video",
  "video/x-msvideo": "video",
  "video/x-matroska": "video",
  "audio/mpeg": "audio",
  "audio/mp4": "audio",
  "audio/wav": "audio",
  "audio/flac": "audio",
  "audio/ogg": "audio",
  "audio/opus": "audio",
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "spreadsheet",
  "application/vnd.ms-excel": "spreadsheet",
  "text/csv": "spreadsheet",
  "application/json": "spreadsheet",
  "application/epub+zip": "ebook",
  "application/x-fictionbook+xml": "ebook",
  "application/x-mobipocket-ebook": "ebook",
  "text/plain": "ebook",
};

function getExtension(name: string): string {
  const match = name.match(/\.([^.]+)$/i);
  return match ? match[1].toLowerCase() : "";
}

function categoryFromExtension(ext: string): FileCategory {
  if (IMAGE_EXT.has(ext)) return "image";
  if (VIDEO_EXT.has(ext)) return "video";
  if (AUDIO_EXT.has(ext)) return "audio";
  if (PDF_EXT.has(ext)) return "pdf";
  if (SPREADSHEET_EXT.has(ext)) return "spreadsheet";
  if (EBOOK_EXT.has(ext)) return "ebook";
  return "unknown";
}

async function analyzeImage(file: File, metadata: FileMetadata): Promise<void> {
  const ext = getExtension(file.name);
  let blob: Blob = file;

  if (ext === "heic" || ext === "heif") {
    try {
      const heic2any = (await import("heic2any")).default;
      const converted = await heic2any({ blob: file, toType: "image/jpeg" });
      blob = Array.isArray(converted) ? converted[0]! : converted;
    } catch {
      /* HEIC preview may fail on some browsers — metadata still shown */
    }
  }

  const dims = await loadImageDimensions(blob);
  metadata.image = {
    width: dims.width,
    height: dims.height,
    hasExif: await checkExif(file),
  };
}

function loadImageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image decode failed"));
    };
    img.src = url;
  });
}

async function checkExif(file: File): Promise<boolean> {
  try {
    const data = await exifr.parse(file, { pick: ["Orientation"] });
    return data != null;
  } catch {
    return false;
  }
}

async function analyzeMedia(
  file: File,
  category: "video" | "audio",
  metadata: FileMetadata,
): Promise<{ tagEncodingIssue?: boolean }> {
  try {
    const tags = await parseBlob(file);
    const format = tags.format;
    if (category === "video") {
      metadata.video = {
        duration: format.duration,
        codec: format.codec,
      };
    } else {
      metadata.audio = {
        duration: format.duration,
        bitrate: format.bitrate,
        codec: format.codec,
      };
      const title = tags.common.title?.trim();
      const artist = tags.common.artist?.trim();
      const tagEncodingIssue =
        Boolean(title && looksLikeBrokenEncoding(title)) ||
        Boolean(artist && looksLikeBrokenEncoding(artist));
      return { tagEncodingIssue };
    }
  } catch {
    /* optional metadata */
  }
  return {};
}

async function analyzePdf(file: File, metadata: FileMetadata): Promise<void> {
  const buffer = await file.arrayBuffer();
  const doc = await loadPdfDocument(new Uint8Array(buffer));
  metadata.pdf = { pageCount: doc.numPages };
}

async function analyzeSpreadsheet(file: File, metadata: FileMetadata): Promise<void> {
  const ext = getExtension(file.name);
  if (ext === "csv" || ext === "json") {
    metadata.spreadsheet = { sheetCount: 1, sheetNames: ["Sheet1"] };
    return;
  }
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  metadata.spreadsheet = {
    sheetCount: wb.SheetNames.length,
    sheetNames: wb.SheetNames,
  };
}

async function analyzeEbook(file: File, metadata: FileMetadata): Promise<void> {
  const ext = getExtension(file.name);
  const ebook: EbookMetadata = { format: ext.toUpperCase(), hasCover: false, hasDrm: false };

  if (ext === "epub") {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const container = await zip.file("META-INF/container.xml")?.async("text");
    if (!container) {
      metadata.ebook = ebook;
      return;
    }
    const rootMatch = container.match(/full-path="([^"]+)"/);
    const rootPath = rootMatch?.[1];
    if (rootPath) {
      const opf = await zip.file(rootPath)?.async("text");
      if (opf) {
        ebook.title = opf.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/i)?.[1]?.trim();
        ebook.author = opf.match(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/i)?.[1]?.trim();
        ebook.hasCover = /cover-image|cover\.(jpg|png|jpeg)/i.test(opf);
      }
    }
    const encryption = zip.file("META-INF/encryption.xml");
    if (encryption) ebook.hasDrm = true;
  } else if (ext === "fb2") {
    const text = await file.text();
    ebook.title = text.match(/<book-title[^>]*>([^<]+)<\/book-title>/i)?.[1]?.trim();
    ebook.author = text.match(/<first-name[^>]*>([^<]+)<\/first-name>/i)?.[1]?.trim();
    ebook.hasCover = text.includes("<coverpage>");
  } else if (ext === "mobi" || ext === "azw3") {
    const buffer = await file.arrayBuffer();
    const view = new Uint8Array(buffer);
    const header = new TextDecoder("latin1").decode(view.slice(0, 64));
    ebook.hasDrm = header.includes("TPZ") || view.includes(0x00) && /DRM/i.test(header);
    const nameMatch = file.name.match(/^(.+)\.(mobi|azw3)$/i);
    if (nameMatch) ebook.title = nameMatch[1].replace(/[-_]/g, " ");
  } else if (ext === "txt") {
    const text = await file.slice(0, 2000).text();
    const firstLine = text.split("\n")[0]?.trim();
    if (firstLine && firstLine.length < 120) ebook.title = firstLine;
  }

  metadata.ebook = ebook;
}

export async function analyzeFile(file: File): Promise<FileAnalysis> {
  const extension = getExtension(file.name);
  const mimeType = file.type || "application/octet-stream";
  let category = MIME_MAP[mimeType] ?? categoryFromExtension(extension);
  const deviceType = detectDeviceType();
  const metadata: FileMetadata = {};

  await initPdfWorker();

  let tagEncodingIssue = false;

  try {
    switch (category) {
      case "image":
        await analyzeImage(file, metadata);
        break;
      case "video":
      case "audio": {
        const media = await analyzeMedia(file, category, metadata);
        tagEncodingIssue = media.tagEncodingIssue ?? false;
        break;
      }
      case "pdf":
        await analyzePdf(file, metadata);
        break;
      case "spreadsheet":
        await analyzeSpreadsheet(file, metadata);
        break;
      case "ebook":
        await analyzeEbook(file, metadata);
        break;
    }
  } catch {
    /* partial analysis is ok */
  }

  const sizeCheck = checkSizeLimit(file.size, category, deviceType);
  let canProcess = category !== "unknown" && sizeCheck.ok;
  let processBlockReason: string | undefined;

  if (category === "unknown") {
    processBlockReason = "Формат не распознан.";
    canProcess = false;
  } else if (!sizeCheck.ok) {
    processBlockReason = `Максимум ${formatFileSize(sizeCheck.limitBytes)} для ${categoryLabel(category)} на этом устройстве.`;
    canProcess = false;
  } else if (metadata.ebook?.hasDrm) {
    processBlockReason = "Файл защищён DRM — обработка невозможна.";
    canProcess = false;
  }

  return {
    file,
    name: file.name,
    extension,
    mimeType,
    category,
    size: file.size,
    sizeLabel: formatFileSize(file.size),
    canProcess,
    processBlockReason,
    metadata,
    deviceType,
    filenameEncodingIssue:
      category === "audio" &&
      (extension === "mp3" || extension === "m4a") &&
      (looksLikeBrokenEncoding(file.name) || tagEncodingIssue),
  };
}

function categoryLabel(category: FileCategory): string {
  const labels: Record<FileCategory, string> = {
    image: "изображений",
    video: "видео",
    audio: "аудио",
    pdf: "PDF",
    spreadsheet: "таблиц",
    ebook: "книг",
    unknown: "файлов",
  };
  return labels[category];
}
