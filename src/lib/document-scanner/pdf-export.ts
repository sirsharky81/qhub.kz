import { PDFDocument } from "pdf-lib";
import type { ExportQuality, ScanPage } from "./types";
import { QUALITY_PRESETS } from "./constants";
import { renderPageToCanvas } from "./a4-layout";
import { canvasToBlob } from "./canvas-utils";
import { getPageSizePt, resolveOrientation } from "./page-size";

export async function exportToPdf(
  pages: ScanPage[],
  quality: ExportQuality,
): Promise<Blob> {
  const pdf = await PDFDocument.create();
  const preset = QUALITY_PRESETS[quality];

  for (const page of pages) {
    const orientation = resolveOrientation(page);
    const { width: ptW, height: ptH } = getPageSizePt(orientation);
    const canvas = await renderPageToCanvas(page);
    const jpeg = await canvasToBlob(canvas, "image/jpeg", preset.jpeg);
    const bytes = new Uint8Array(await jpeg.arrayBuffer());
    const pdfPage = pdf.addPage([ptW, ptH]);
    const img = await pdf.embedJpg(bytes);

    pdfPage.drawImage(img, {
      x: 0,
      y: 0,
      width: ptW,
      height: ptH,
    });
  }

  const pdfBytes = await pdf.save();
  return new Blob([pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
}
