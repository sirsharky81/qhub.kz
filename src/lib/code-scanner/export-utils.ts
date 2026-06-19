import * as XLSX from "xlsx";

function escapeCsvCell(value: string, delimiter: string): string {
  if (value.includes(delimiter) || value.includes('"') || value.includes("\n") || value.includes("\r")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function matrixToCsv(rows: string[][], delimiter = ";"): string {
  return rows.map((row) => row.map((cell) => escapeCsvCell(cell, delimiter)).join(delimiter)).join("\r\n");
}

export function downloadText(content: string, filename: string, mime = "text/plain;charset=utf-8"): void {
  const blob = new Blob([content], { type: mime });
  triggerDownload(blob, filename);
}

export function downloadCsv(rows: string[][], filename: string): void {
  const csv = `\uFEFF${matrixToCsv(rows)}`;
  downloadText(csv, filename, "text/csv;charset=utf-8");
}

export function downloadXlsx(rows: string[][], filename: string, sheetName = "Данные"): void {
  if (rows.length > 20_001) {
    throw new Error("XLSX_LIMIT");
  }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, filename);
}

export function downloadXlsxIfAllowed(
  rows: string[][],
  filename: string,
  sheetName = "Данные",
): { ok: true } | { ok: false; reason: "limit" } {
  if (rows.length > 20_001) return { ok: false, reason: "limit" };
  downloadXlsx(rows, filename, sheetName);
  return { ok: true };
}

export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

export async function shareText(title: string, text: string): Promise<"shared" | "copied"> {
  if (navigator.share) {
    try {
      await navigator.share({ title, text });
      return "shared";
    } catch {
      /* fall through */
    }
  }
  await copyText(text);
  return "copied";
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function slugFilename(prefix: string, ext: string): string {
  const date = new Date().toISOString().slice(0, 10);
  return `${prefix}-${date}.${ext}`;
}

export async function downloadZip(files: { name: string; content: string | Blob }[], zipName: string): Promise<void> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  for (const file of files) {
    zip.file(file.name, file.content);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  triggerDownload(blob, zipName);
}
