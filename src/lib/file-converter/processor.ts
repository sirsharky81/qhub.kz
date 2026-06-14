import type { ActionId, ProcessProgress, ProcessResult } from "./types";
import { validateResult } from "./result-validator";
import { ConverterError } from "./errors";
import * as imageEngine from "./engines/image-engine";
import * as videoEngine from "./engines/video-engine";
import * as audioEngine from "./engines/audio-engine";
import * as pdfEngine from "./engines/pdf-engine";
import * as spreadsheetEngine from "./engines/spreadsheet-engine";
import * as ebookEngine from "./engines/ebook-engine";
import { cancelFfmpegOperation } from "./ffmpeg-client";

export function cancelProcessing(): void {
  cancelFfmpegOperation();
}

export async function processAction(
  file: File,
  actionId: ActionId,
  onProgress?: (p: ProcessProgress) => void,
): Promise<ProcessResult> {
  onProgress?.({ stage: "start", percent: 0, message: "Запуск…" });

  let result: { blob: Blob; filename: string; mimeType: string };

  switch (actionId) {
    case "image-to-jpg":
      result = await imageEngine.convertImage(file, "jpg", onProgress);
      break;
    case "image-to-png":
      result = await imageEngine.convertImage(file, "png", onProgress);
      break;
    case "image-to-webp":
      result = await imageEngine.convertImage(file, "webp", onProgress);
      break;
    case "image-to-avif":
      result = await imageEngine.convertImage(file, "avif", onProgress);
      break;
    case "image-to-ico":
      result = await imageEngine.convertImage(file, "ico", onProgress);
      break;
    case "image-compress":
      result = await imageEngine.compressImage(file, onProgress);
      break;
    case "image-remove-exif":
      result = await imageEngine.removeExif(file, onProgress);
      break;
    case "video-to-mp3":
      result = await videoEngine.extractMp3(file, onProgress);
      break;
    case "video-to-webm":
      result = await videoEngine.convertToWebm(file, onProgress);
      break;
    case "video-to-gif":
      result = await videoEngine.createGif(file, onProgress);
      break;
    case "video-compress":
      result = await videoEngine.compressVideo(file, onProgress);
      break;
    case "video-resize":
      result = await videoEngine.resizeVideo(file, onProgress);
      break;
    case "audio-to-mp3":
      result = await audioEngine.convertAudio(file, "mp3", onProgress);
      break;
    case "audio-to-wav":
      result = await audioEngine.convertAudio(file, "wav", onProgress);
      break;
    case "audio-to-aac":
      result = await audioEngine.convertAudio(file, "aac", onProgress);
      break;
    case "audio-to-flac":
      result = await audioEngine.convertAudio(file, "flac", onProgress);
      break;
    case "audio-to-ogg":
      result = await audioEngine.convertAudio(file, "ogg", onProgress);
      break;
    case "audio-change-bitrate":
      result = await audioEngine.changeBitrate(file, onProgress);
      break;
    case "audio-fix-filename":
      result = await audioEngine.fixMp3Filename(file, onProgress);
      break;
    case "pdf-to-txt":
      result = await pdfEngine.pdfToText(file, onProgress);
      break;
    case "pdf-to-jpg":
      result = await pdfEngine.pdfToImages(file, "jpg", onProgress);
      break;
    case "pdf-to-png":
      result = await pdfEngine.pdfToImages(file, "png", onProgress);
      break;
    case "xlsx-to-csv":
      result = await spreadsheetEngine.xlsxToCsv(file, onProgress);
      break;
    case "csv-to-xlsx":
      result = await spreadsheetEngine.csvToXlsx(file, onProgress);
      break;
    case "xlsx-to-json":
      result = await spreadsheetEngine.xlsxToJson(file, onProgress);
      break;
    case "json-to-xlsx":
      result = await spreadsheetEngine.jsonToXlsx(file, onProgress);
      break;
    case "epub-to-pdf":
      result = await ebookEngine.epubToPdf(file, onProgress);
      break;
    case "epub-to-txt":
      result = await ebookEngine.epubToTxt(file, onProgress);
      break;
    case "epub-cover":
      result = await ebookEngine.extractEpubCover(file, onProgress);
      break;
    case "fb2-to-epub":
      result = await ebookEngine.fb2ToEpub(file, onProgress);
      break;
    case "fb2-to-pdf":
      result = await ebookEngine.fb2ToPdf(file, onProgress);
      break;
    case "fb2-to-txt":
      result = await ebookEngine.fb2ToTxt(file, onProgress);
      break;
    case "mobi-to-epub":
      result = await ebookEngine.mobiToEpub(file, onProgress);
      break;
    case "mobi-to-pdf":
      result = await ebookEngine.mobiToPdf(file, onProgress);
      break;
    case "txt-to-epub":
      result = await ebookEngine.txtToEpub(file, onProgress);
      break;
    default:
      throw new ConverterError("unsupported");
  }

  onProgress?.({ stage: "validate", percent: 95, message: "Проверка результата…" });
  const validation = await validateResult(result.blob, result.filename, actionId);
  if (!validation.ok) {
    throw new ConverterError("conversion-failed", validation.message);
  }

  onProgress?.({ stage: "done", percent: 100, message: "Обработка успешно завершена" });

  return {
    blob: result.blob,
    filename: result.filename,
    mimeType: result.mimeType,
    size: result.blob.size,
  };
}
