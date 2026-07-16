import { recognizeCroppedBlob } from "@/lib/document-scanner/ocr-export";
import { DEFAULT_ADJUSTMENTS } from "@/lib/document-scanner/types";
import { parseReceiptOcrText } from "./parse-receipt-ocr";
import type { ReceiptScanPayload } from "./types";

export async function scanReceiptImage(
  file: Blob,
  onProgress?: (message: string) => void,
): Promise<ReceiptScanPayload> {
  onProgress?.("Распознавание текста…");
  const text = await recognizeCroppedBlob(file, "enhanced", DEFAULT_ADJUSTMENTS, "auto", (_cur, _total, msg) => {
    onProgress?.(msg);
  });
  if (!text.trim()) {
    return {
      source: "ocr_receipt",
      amount: "",
      confidence: "low",
      description: undefined,
    };
  }
  return parseReceiptOcrText(text);
}
