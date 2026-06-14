import JSZip from "jszip";
import { loadPdfDocument } from "@/app/tools/_pdf-shared/pdfWorker";
import type { ProcessProgress } from "../types";
import { ConverterError } from "../errors";

async function renderPageToCanvas(
  page: import("pdfjs-dist").PDFPageProxy,
  scale = 2,
): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d")!;
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  return canvas;
}

export async function pdfToText(
  file: File,
  onProgress?: (p: ProcessProgress) => void,
): Promise<{ blob: Blob; filename: string; mimeType: string }> {
  const buffer = await file.arrayBuffer();
  const doc = await loadPdfDocument(new Uint8Array(buffer));
  const parts: string[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    onProgress?.({
      stage: "extract",
      percent: Math.round((i / doc.numPages) * 90),
      message: `Страница ${i} из ${doc.numPages}…`,
    });
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    parts.push(text);
  }

  const blob = new Blob([parts.join("\n\n")], { type: "text/plain;charset=utf-8" });
  return {
    blob,
    filename: file.name.replace(/\.pdf$/i, ".txt"),
    mimeType: "text/plain",
  };
}

export async function pdfToImages(
  file: File,
  format: "jpg" | "png",
  onProgress?: (p: ProcessProgress) => void,
): Promise<{ blob: Blob; filename: string; mimeType: string }> {
  const buffer = await file.arrayBuffer();
  const doc = await loadPdfDocument(new Uint8Array(buffer));
  const mime = format === "jpg" ? "image/jpeg" : "image/png";
  const blobs: { name: string; blob: Blob }[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    onProgress?.({
      stage: "render",
      percent: Math.round((i / doc.numPages) * 90),
      message: `Страница ${i} из ${doc.numPages}…`,
    });
    const page = await doc.getPage(i);
    const canvas = await renderPageToCanvas(page);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new ConverterError("conversion-failed"))),
        mime,
        0.92,
      );
    });
    blobs.push({ name: `page-${String(i).padStart(3, "0")}.${format}`, blob });
  }

  if (blobs.length === 1) {
    return {
      blob: blobs[0]!.blob,
      filename: file.name.replace(/\.pdf$/i, `.${format}`),
      mimeType: mime,
    };
  }

  const zip = new JSZip();
  for (const item of blobs) zip.file(item.name, item.blob);
  const zipBlob = await zip.generateAsync({ type: "blob" });
  return {
    blob: zipBlob,
    filename: file.name.replace(/\.pdf$/i, `-pages.zip`),
    mimeType: "application/zip",
  };
}
