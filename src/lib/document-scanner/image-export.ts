import { saveBlobToDevice } from "@/lib/platform/save-file";
import type { ExportFormat, ExportQuality, ScanPage } from "./types";
import { QUALITY_PRESETS } from "./constants";
import { renderPageToCanvas } from "./a4-layout";
import { canvasToBlob } from "./canvas-utils";

const MIME: Record<ExportFormat, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export async function exportPagesAsImages(
  pages: ScanPage[],
  format: Exclude<ExportFormat, "pdf">,
  quality: ExportQuality,
): Promise<{ blob: Blob; filename: string }[]> {
  const preset = QUALITY_PRESETS[quality];
  const mime = MIME[format];
  const ext = format === "jpg" ? "jpg" : format;
  const results: { blob: Blob; filename: string }[] = [];

  for (let i = 0; i < pages.length; i++) {
    const canvas = await renderPageToCanvas(pages[i]!);
    const q = format === "png" ? undefined : format === "webp" ? preset.webp : preset.jpeg;
    const blob = await canvasToBlob(canvas, mime, q);
    results.push({ blob, filename: `page-${i + 1}.${ext}` });
  }

  return results;
}

export function downloadBlob(blob: Blob, filename: string): void {
  void saveBlobToDevice(blob, filename);
}

export async function downloadZip(files: { blob: Blob; filename: string }[], zipName: string): Promise<void> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  for (const f of files) zip.file(f.filename, f.blob);
  const content = await zip.generateAsync({ type: "blob" });
  downloadBlob(content, zipName);
}
