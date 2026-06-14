import JSZip from "jszip";
import type { ProcessProgress } from "../types";
import { ConverterError } from "../errors";
import { uint8ToBlob } from "../ffmpeg-client";

export async function xlsxToCsv(
  file: File,
  onProgress?: (p: ProcessProgress) => void,
): Promise<{ blob: Blob; filename: string; mimeType: string }> {
  const XLSX = await import("xlsx");
  onProgress?.({ stage: "read", percent: 30, message: "Чтение таблицы…" });
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });

  if (wb.SheetNames.length === 1) {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]!]!);
    return {
      blob: new Blob([csv], { type: "text/csv;charset=utf-8" }),
      filename: file.name.replace(/\.(xlsx|xls)$/i, ".csv"),
      mimeType: "text/csv",
    };
  }

  const zip = new JSZip();
  wb.SheetNames.forEach((name, i) => {
    onProgress?.({
      stage: "convert",
      percent: 30 + (i / wb.SheetNames.length) * 60,
      message: `Лист «${name}»…`,
    });
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]!);
    zip.file(`${name}.csv`, csv);
  });

  return {
    blob: await zip.generateAsync({ type: "blob" }),
    filename: file.name.replace(/\.(xlsx|xls)$/i, "-sheets.zip"),
    mimeType: "application/zip",
  };
}

export async function csvToXlsx(
  file: File,
  onProgress?: (p: ProcessProgress) => void,
): Promise<{ blob: Blob; filename: string; mimeType: string }> {
  const XLSX = await import("xlsx");
  onProgress?.({ stage: "read", percent: 40, message: "Чтение CSV…" });
  const text = await file.text();
  const wb = XLSX.read(text, { type: "string" });
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return {
    blob: uint8ToBlob(new Uint8Array(out), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    filename: file.name.replace(/\.csv$/i, ".xlsx"),
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
}

export async function xlsxToJson(
  file: File,
  onProgress?: (p: ProcessProgress) => void,
): Promise<{ blob: Blob; filename: string; mimeType: string }> {
  const XLSX = await import("xlsx");
  onProgress?.({ stage: "read", percent: 40, message: "Чтение таблицы…" });
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const result: Record<string, unknown[]> = {};
  wb.SheetNames.forEach((name) => {
    result[name] = XLSX.utils.sheet_to_json(wb.Sheets[name]!);
  });
  const json = JSON.stringify(result, null, 2);
  return {
    blob: new Blob([json], { type: "application/json" }),
    filename: file.name.replace(/\.(xlsx|xls)$/i, ".json"),
    mimeType: "application/json",
  };
}

export async function jsonToXlsx(
  file: File,
  onProgress?: (p: ProcessProgress) => void,
): Promise<{ blob: Blob; filename: string; mimeType: string }> {
  const XLSX = await import("xlsx");
  onProgress?.({ stage: "read", percent: 40, message: "Чтение JSON…" });
  let data: unknown;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new ConverterError("corrupted");
  }
  const wb = XLSX.utils.book_new();
  if (Array.isArray(data)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "Sheet1");
  } else if (data && typeof data === "object") {
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (Array.isArray(value)) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(value), key.slice(0, 31));
      }
    }
  }
  if (wb.SheetNames.length === 0) throw new ConverterError("conversion-failed");
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return {
    blob: uint8ToBlob(new Uint8Array(out), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    filename: file.name.replace(/\.json$/i, ".xlsx"),
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
}
