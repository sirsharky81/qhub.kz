import { DEFAULT_CATEGORIES } from "../constants";
import type { ReceiptScanConfidence, ReceiptScanPayload } from "./types";

const TOTAL_KEYWORDS =
  /(?:^|\s)(?:ИТОГО|ИТОГ|TOTAL|К\s*ОПЛАТЕ|СУММА|БАРЛЫҒЫ|ТӨЛЕМ|TOPLAM)(?:\s|$)/i;

const SKIP_AMOUNT_LINE =
  /(?:НДС|VAT|СДАЧА|БОНУС|КЕШБ[ЕЭ]К|НАЛИЧН|БЕЗНАЛ|KASPI|HALYK|ПЕРЕВОД|ОПЛАТА\s*КАРТ)/i;

const SKIP_DESCRIPTION_LINE =
  /^(?:\d{2}[./]\d{2}[./]\d{2,4}|\d{12}|\d{10,12}|БИН|ИИН|РНМ|ФП|ФИСК|ЧЕК\s*№|ТОО\s*$|ИП\s*$)/i;

const AMOUNT_RE = /(\d[\d\s]*[.,]\d{2}|\d[\d\s]*)/g;

function normalizeAmount(raw: string): string | null {
  const cleaned = raw.replace(/\s/g, "").replace(",", ".");
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0 || n > 10_000_000) return null;
  return n.toFixed(2);
}

function extractAmountsFromLine(line: string): string[] {
  const out: string[] = [];
  for (const m of line.matchAll(AMOUNT_RE)) {
    const v = normalizeAmount(m[1] ?? "");
    if (v) out.push(v);
  }
  return out;
}

function detectCurrency(text: string): string | undefined {
  if (/₸|тг\.?|KZT/i.test(text)) return "KZT";
  if (/USD|\$/i.test(text)) return "USD";
  if (/EUR|€/i.test(text)) return "EUR";
  if (/RUB|₽/i.test(text)) return "RUB";
  return undefined;
}

function suggestCategory(text: string): string {
  const lower = text.toLowerCase();
  if (/magnum|small|market|продукт|ресторан|кафе|coffee|асхана|магазин/.test(lower)) return "food";
  if (/такси|taxi|yandex|uber|бензин|заправк|azs/.test(lower)) return "transport";
  if (/hotel|отель|hostel|гостин/.test(lower)) return "stay";
  return "other";
}

function suggestDescription(lines: string[]): string | undefined {
  for (const line of lines) {
    const t = line.trim();
    if (t.length < 4 || t.length > 80) continue;
    if (SKIP_DESCRIPTION_LINE.test(t)) continue;
    if (/^\d+[.,]?\d*$/.test(t.replace(/\s/g, ""))) continue;
    if (!/[A-Za-zА-Яа-яЁёҚқӘәҢңҒғҮүҰұӨөІі]/.test(t)) continue;
    return t.slice(0, 40);
  }
  return undefined;
}

function fallbackDescription(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `Чек от ${dd}.${mm}.${d.getFullYear()}`;
}

export function parseReceiptOcrText(ocrText: string): ReceiptScanPayload {
  const lines = ocrText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const lowerHalfStart = Math.floor(lines.length / 2);
  let confidence: ReceiptScanConfidence = "low";
  let amount = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (SKIP_AMOUNT_LINE.test(line)) continue;
    if (!TOTAL_KEYWORDS.test(line)) continue;
    const candidates = extractAmountsFromLine(line);
    if (candidates.length > 0) {
      amount = candidates[candidates.length - 1]!;
      confidence = "medium";
      break;
    }
  }

  if (!amount) {
    let best = "";
    for (let i = lowerHalfStart; i < lines.length; i++) {
      const line = lines[i]!;
      if (SKIP_AMOUNT_LINE.test(line)) continue;
      for (const v of extractAmountsFromLine(line)) {
        if (!best || Number(v) > Number(best)) best = v;
      }
    }
    amount = best;
  }

  const description = suggestDescription(lines) ?? fallbackDescription();
  const categoryId = DEFAULT_CATEGORIES.some((c) => c.id === suggestCategory(ocrText))
    ? suggestCategory(ocrText)
    : "other";

  return {
    source: "ocr_receipt",
    amount,
    currency: detectCurrency(ocrText),
    description,
    categoryId,
    confidence: amount && confidence === "medium" ? "medium" : "low",
    ocrExcerpt: ocrText.slice(0, 200),
  };
}
