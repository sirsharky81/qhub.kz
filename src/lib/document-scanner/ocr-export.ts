import {
  Document,
  PageBreak,
  Packer,
  Paragraph,
} from "docx";
import { saveAs } from "file-saver";
import type { FilterMode, PageAdjustments, ScanItem, ScanPage } from "./types";
import { blobToCanvas, detectContentRect, downscaleCanvas } from "./canvas-utils";
import { applyFilters } from "./filters";

const OCR_MAX_PX = 2400;

export type OcrLanguage = "auto" | "rus" | "kaz" | "eng";

export const OCR_LANGUAGE_OPTIONS: { id: OcrLanguage; label: string; hint?: string }[] = [
  {
    id: "auto",
    label: "Авто",
    hint: "Русский, қазақша и English — язык определяется автоматически",
  },
  { id: "rus", label: "Русский" },
  { id: "kaz", label: "Қазақша" },
  { id: "eng", label: "English" },
];

function resolveOcrLangs(language: OcrLanguage): string | string[] {
  if (language === "auto") return ["rus", "kaz", "eng"];
  return language;
}

export type OcrProgress = (current: number, total: number, message: string) => void;

async function blobToOcrCanvas(
  blob: Blob,
  filter: FilterMode,
  adjustments: PageAdjustments,
): Promise<HTMLCanvasElement> {
  const filtered = applyFilters(await blobToCanvas(blob), filter, adjustments);
  const content = detectContentRect(filtered);
  const cropped = document.createElement("canvas");
  cropped.width = content.sw;
  cropped.height = content.sh;
  cropped
    .getContext("2d")!
    .drawImage(filtered, content.sx, content.sy, content.sw, content.sh, 0, 0, content.sw, content.sh);
  return downscaleCanvas(cropped, OCR_MAX_PX);
}

async function itemToOcrCanvas(
  item: ScanItem,
  page: Pick<ScanPage, "filter" | "adjustments">,
): Promise<HTMLCanvasElement> {
  return blobToOcrCanvas(item.imageBlob, page.filter, page.adjustments);
}

async function withOcrWorker<T>(
  language: OcrLanguage,
  fn: (recognize: (canvas: HTMLCanvasElement) => Promise<string>) => Promise<T>,
): Promise<T> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker(resolveOcrLangs(language));
  try {
    return await fn(async (canvas) => {
      const { data } = await worker.recognize(canvas);
      return data.text.trim();
    });
  } finally {
    await worker.terminate();
  }
}

export async function recognizeScanPages(
  pages: ScanPage[],
  language: OcrLanguage = "auto",
  onProgress?: OcrProgress,
): Promise<string[]> {
  const total = pages.reduce((n, page) => n + page.items.length, 0);
  let current = 0;

  return withOcrWorker(language, async (recognize) => {
    const results: string[] = [];

    for (const page of pages) {
      const parts: string[] = [];
      for (const item of page.items) {
        current += 1;
        onProgress?.(current, total, `Распознавание ${current} из ${total}…`);
        const canvas = await itemToOcrCanvas(item, page);
        const text = await recognize(canvas);
        if (text) parts.push(text);
      }
      results.push(parts.join("\n\n"));
    }

    return results;
  });
}

export async function recognizeCroppedBlob(
  blob: Blob,
  filter: FilterMode,
  adjustments: PageAdjustments,
  language: OcrLanguage = "auto",
  onProgress?: OcrProgress,
): Promise<string> {
  onProgress?.(1, 1, "Распознавание текста…");
  return withOcrWorker(language, async (recognize) => {
    const canvas = await blobToOcrCanvas(blob, filter, adjustments);
    return recognize(canvas);
  });
}

function textToParagraphs(text: string): Paragraph[] {
  const lines = text.split(/\r?\n/);
  if (lines.length === 0 || (lines.length === 1 && !lines[0]!.trim())) {
    return [new Paragraph({ text: "" })];
  }
  return lines.map((line) => new Paragraph({ text: line }));
}

export async function exportRecognizedTextToWord(texts: string[], filename: string): Promise<void> {
  const children: Paragraph[] = [];

  texts.forEach((text, index) => {
    if (index > 0) {
      children.push(new Paragraph({ children: [new PageBreak()] }));
    }
    children.push(...textToParagraphs(text));
  });

  const doc = new Document({
    sections: [{ children }],
  });

  const blob = await Packer.toBlob(doc);
  const safeName = filename.replace(/[<>:"/\\|?*]/g, "_").trim() || "Scan";
  saveAs(blob, `${safeName}.docx`);
}

export function hasRecognizedText(texts: string[]): boolean {
  return texts.some((text) => text.trim().length > 0);
}
