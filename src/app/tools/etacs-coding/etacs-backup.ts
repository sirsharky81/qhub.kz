import {
  etacsDownloadNames,
  formatMutCodingContainer,
  type EtacsCodingDump,
} from "@/lib/obd/mitsubishi-etacs";
import { downloadBlobDirect, saveBlobToDevice } from "@/lib/platform/save-file";
import { bytesToHex } from "@/lib/obd/hex";

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

/**
 * Определяет тип файла кодировки (.kon или .cuf), даже если браузер или мессенджер
 * добавил суффикс после расширения (например, `file.kon (1)` или `file.kon_copy`).
 */
export function detectCodingExtension(fileName: string): ".kon" | ".cuf" {
  if (/\.cuf(?=$|[^a-zA-Z])/i.test(fileName)) return ".cuf";
  return ".kon";
}

/**
 * Очищает базовое имя файла от расширения (.kon / .cuf) и любых хвостов,
 * которые могли оказаться после расширения (`8637C671.kon_copy` -> `8637C671`).
 */
export function cleanCodingFileStem(fileName: string, fallback = "coding"): string {
  const baseName = (fileName.split(/[/\\]/).pop() ?? fileName).trim();
  const withoutExtAndTail = baseName
    .replace(/\.(kon|cuf).*$/i, "")
    .replace(/[._-](original|before-write|edited|mod|orig|copy)(?:[._-]*\d+)*$/i, "")
    .replace(/[\s._-]+$/g, "")
    .trim();
  const safe = withoutExtAndTail.replace(/[^\w.\-()+\u0400-\u04FF ]+/g, "_");
  return safe || fallback;
}

/**
 * Гарантирует, что имя файла заканчивается строго на `.kon` или `.cuf`
 * (никогда не ставит суффикс после расширения, но сохраняет пользовательские метки до расширения).
 */
export function ensureCodingFileName(inputName: string, ext: ".kon" | ".cuf"): string {
  const baseName = (inputName.split(/[/\\]/).pop() ?? inputName).trim();
  const withoutExtAndTail = baseName
    .replace(/\.(kon|cuf).*$/i, "")
    .replace(/[\s._-]+$/g, "")
    .trim();
  const safe = withoutExtAndTail.replace(/[^\w.\-()+\u0400-\u04FF ]+/g, "_") || "coding";
  return `${safe}${ext}`;
}

export function backupFileName(
  originalName: string,
  tag: "original" | "before-write" | "edited" = "original",
): string {
  const ext = detectCodingExtension(originalName);
  const base = cleanCodingFileStem(originalName, "coding");
  return `${base}_${tag}_${stamp()}${ext}`;
}

export function canUseSaveFilePicker(): boolean {
  if (typeof window === "undefined") return false;
  const win = window as Window & { showSaveFilePicker?: unknown };
  return Boolean(window.isSecureContext && typeof win.showSaveFilePicker === "function");
}

/**
 * Сохраняет файл через системный диалог выбора папки и имени (`showSaveFilePicker`),
 * если браузер его поддерживает. Возвращает итоговое имя файла или `null`, если диалог недоступен.
 * При отмене пользователем выбрасывает AbortError.
 */
export async function saveBytesWithFilePicker(
  bytes: Uint8Array,
  suggestedName: string,
): Promise<string | null> {
  if (!canUseSaveFilePicker()) return null;
  const ext = detectCodingExtension(suggestedName);
  const cleanSuggested = ensureCodingFileName(suggestedName, ext);
  const win = window as Window & {
    showSaveFilePicker?: (opts?: {
      suggestedName?: string;
      types?: Array<{ description: string; accept: Record<string, string[]> }>;
    }) => Promise<FileSystemFileHandle>;
  };
  if (!win.showSaveFilePicker) return null;

  const handle = await win.showSaveFilePicker({
    suggestedName: cleanSuggested,
    types: [
      {
        description:
          ext === ".cuf"
            ? "Файл Custom Coding Mitsubishi (.cuf)"
            : "Файл Variant Coding Mitsubishi (.kon)",
        accept: {
          "application/octet-stream": [ext],
        },
      },
    ],
  });

  const writable = await handle.createWritable();
  const copy = new Uint8Array(bytes);
  await writable.write(copy.buffer as ArrayBuffer);
  await writable.close();
  return handle.name || cleanSuggested;
}

/**
 * Сохраняет байты кодировки выбранным способом:
 * - `picker`: системный диалог «Сохранить как…» (выбор папки и имени файла) с фолбэком на скачивание
 * - `download`: прямое скачивание в браузере с указанным именем (без перехвата Share Sheet)
 * - `share`: системное меню «Поделиться / Сохранить в Файлы» (удобно на iOS / Android для выбора папки)
 */
export async function saveCodingBytesAs(
  bytes: Uint8Array,
  fileName: string,
  method: "picker" | "download" | "share" = "download",
): Promise<string> {
  const ext = detectCodingExtension(fileName);
  const finalName = ensureCodingFileName(fileName, ext);
  const copy = new Uint8Array(bytes);
  const blob = new Blob([copy.buffer as ArrayBuffer], { type: "application/octet-stream" });

  if (method === "picker") {
    try {
      const pickedName = await saveBytesWithFilePicker(copy, finalName);
      if (pickedName) return pickedName;
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") {
        throw err;
      }
      // Если браузер заблокировал File Picker (например, в iframe/webview), скачиваем напрямую
    }
    downloadBlobDirect(blob, finalName);
    return finalName;
  }

  if (method === "share") {
    await saveBlobToDevice(blob, finalName);
    return finalName;
  }

  downloadBlobDirect(blob, finalName);
  return finalName;
}

export async function saveOriginalFileBackup(
  bytes: Uint8Array,
  displayName: string,
  customFileName?: string,
  method: "picker" | "download" | "share" = "download",
): Promise<string> {
  const ext = detectCodingExtension(displayName);
  const targetName = customFileName
    ? ensureCodingFileName(customFileName, ext)
    : backupFileName(displayName, "original");
  return saveCodingBytesAs(bytes, targetName, method);
}

export async function saveEtacsDumpBackup(dump: EtacsCodingDump): Promise<{
  kon: string;
  cuf: string | null;
  json: string;
}> {
  const part = dump.partNumber ?? "8637C671";
  const vin = dump.vin ?? "UNKNOWNVIN0000000";
  const ts = stamp();
  const prefix = `${part}_${vin}_${ts}`;
  const names = etacsDownloadNames(prefix, { partNumber: part, vin });

  const now = new Date();
  const konBytes = formatMutCodingContainer({
    payload: dump.variant,
    partNumber: part,
    vin,
    timestamp: now,
  });
  await saveBlobToDevice(new Blob([Uint8Array.from(konBytes)]), names.kon);

  let cufName: string | null = null;
  if (dump.custom.length > 0) {
    const cufBytes = formatMutCodingContainer({
      payload: dump.custom,
      partNumber: part,
      vin,
      timestamp: now,
    });
    await saveBlobToDevice(new Blob([Uint8Array.from(cufBytes)]), names.cuf);
    cufName = names.cuf;
  }

  const backup = {
    timestamp: now.toISOString(),
    source: "qhub-etacs-coding-ecu-read",
    profileId: dump.profileId,
    tx: dump.txHex,
    rx: dump.rxHex,
    partNumber: dump.partNumber,
    swVersion: dump.swVersion ?? null,
    vin: dump.vin ?? null,
    variantUsedId: dump.variantUsedId ?? null,
    customUsedId: dump.customUsedId ?? null,
    variantHex: bytesToHex(dump.variant, ""),
    customHex: bytesToHex(dump.custom, ""),
  };
  await saveBlobToDevice(
    new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }),
    names.json,
  );

  return { kon: names.kon, cuf: cufName, json: names.json };
}
