import { describe, expect, it } from "vitest";
import { parseReceiptOcrText } from "./parse-receipt-ocr";

describe("parseReceiptOcrText", () => {
  it("finds ИТОГО on same line (medium confidence)", () => {
    const r = parseReceiptOcrText(`
      TOO Magnum
      Молоко 500.00
      ИТОГО 5 840,00
      БИН 123456789012
    `);
    expect(r.amount).toBe("5840.00");
    expect(r.confidence).toBe("medium");
    expect(r.description).toMatch(/Magnum/i);
    expect(r.categoryId).toBe("food");
  });

  it("finds TOTAL in lower half when no keyword line match", () => {
    const r = parseReceiptOcrText(`
      Line one
      Line two
      Something 100.00
      Another 250.50
    `);
    expect(r.amount).toBe("250.50");
    expect(r.confidence).toBe("low");
  });

  it("skips VAT line when picking max in lower half", () => {
    const r = parseReceiptOcrText(`
      Shop
      ИТОГО 1 200,00
      НДС 128,57
    `);
    expect(r.amount).toBe("1200.00");
    expect(r.confidence).toBe("medium");
  });

  it("detects KZT from symbol", () => {
    const r = parseReceiptOcrText("ИТОГО 100,00 ₸");
    expect(r.currency).toBe("KZT");
  });

  it("returns empty amount when nothing found", () => {
    const r = parseReceiptOcrText("нет цифр");
    expect(r.amount).toBe("");
    expect(r.confidence).toBe("low");
  });
});
