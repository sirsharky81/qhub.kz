export type ReceiptScanConfidence = "medium" | "low";

export interface ReceiptScanPayload {
  source: "ocr_receipt";
  amount: string;
  currency?: string;
  description?: string;
  categoryId?: string;
  confidence: ReceiptScanConfidence;
  ocrExcerpt?: string;
}
