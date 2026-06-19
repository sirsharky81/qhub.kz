import { PDFDocument, StandardFonts, rgb, type PDFImage, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { saveAs } from "file-saver";
import { renderCode128DataUrl } from "./barcode";

const FONT_REGULAR = "/fonts/Roboto-Regular.woff2";

interface LabelFonts {
  latin: PDFFont;
  unicode: PDFFont;
}

async function loadLabelFonts(pdf: PDFDocument): Promise<LabelFonts> {
  pdf.registerFontkit(fontkit);
  const latin = await pdf.embedFont(StandardFonts.Helvetica);
  const bytes = await fetch(FONT_REGULAR).then((r) => r.arrayBuffer());
  const unicode = await pdf.embedFont(new Uint8Array(bytes));
  return { latin, unicode };
}

/** Разбить строку на фрагменты Latin / Unicode для разных шрифтов. */
function splitFontRuns(text: string): { text: string; useUnicode: boolean }[] {
  const runs: { text: string; useUnicode: boolean }[] = [];
  let buf = "";
  let mode: boolean | null = null;

  for (const char of text) {
    const useUnicode = char.charCodeAt(0) > 0x7f;
    if (mode === null) {
      mode = useUnicode;
      buf = char;
    } else if (useUnicode === mode) {
      buf += char;
    } else {
      runs.push({ text: buf, useUnicode: mode });
      buf = char;
      mode = useUnicode;
    }
  }
  if (buf) runs.push({ text: buf, useUnicode: mode ?? false });
  return runs;
}

function measureMixedText(text: string, size: number, fonts: LabelFonts): number {
  return splitFontRuns(text).reduce((w, run) => {
    const font = run.useUnicode ? fonts.unicode : fonts.latin;
    return w + font.widthOfTextAtSize(run.text, size);
  }, 0);
}

function drawMixedTextLine(
  page: PDFPage,
  fonts: LabelFonts,
  text: string,
  centerX: number,
  y: number,
  size: number,
  color = rgb(0, 0, 0),
): void {
  const runs = splitFontRuns(text);
  let x = centerX - measureMixedText(text, size, fonts) / 2;
  for (const run of runs) {
    const font = run.useUnicode ? fonts.unicode : fonts.latin;
    page.drawText(run.text, { x, y, size, font, color });
    x += font.widthOfTextAtSize(run.text, size);
  }
}

export type LabelFormat =
  | "standard"
  | "40x30"
  | "58x40"
  | "a4-grid"
  | "mini-20"
  | "mini-25"
  | "mini-30";

export type CodeMarkType = "qr" | "barcode" | "both";

/** mm → PDF points (1 mm ≈ 2.835 pt) */
const MM = 2.835;

export interface LabelData {
  identifier: string;
  title: string;
  qrDataUrl: string | null;
  barcodeDataUrl: string | null;
  codeType: CodeMarkType;
}

export interface BulkLabelRow {
  identifier: string;
  title?: string;
}

const A4 = { w: 210 * MM, h: 297 * MM };

export function getLabelDimensions(format: LabelFormat): { w: number; h: number } {
  switch (format) {
    case "40x30":
      return { w: 40 * MM, h: 30 * MM };
    case "58x40":
    case "a4-grid":
    case "standard":
      return { w: 58 * MM, h: 40 * MM };
    case "mini-20":
      return { w: 20 * MM, h: 20 * MM };
    case "mini-25":
      return { w: 25 * MM, h: 25 * MM };
    case "mini-30":
      return { w: 30 * MM, h: 30 * MM };
    default:
      return { w: 58 * MM, h: 40 * MM };
  }
}

function pngBytesFromDataUrl(dataUrl: string): Uint8Array {
  const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1]! : dataUrl;
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

export interface BulkPdfOptions {
  codeType: CodeMarkType;
  labelFormat?: LabelFormat;
  filename?: string;
}

export interface LabelCodeImages {
  qrDataUrl: string | null;
  barcodeDataUrl: string | null;
}

/** Генерация QR/штрихкода для PDF (штрихкод без дублирующей подписи — текст рисуем отдельно). */
export async function buildLabelCodeImages(
  identifier: string,
  codeType: CodeMarkType,
): Promise<LabelCodeImages> {
  const QRCode = (await import("qrcode")).default;
  let qrDataUrl: string | null = null;
  let barcodeDataUrl: string | null = null;

  if (codeType === "qr" || codeType === "both") {
    qrDataUrl = await QRCode.toDataURL(identifier, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 320,
    });
  }

  if (codeType === "barcode" || codeType === "both") {
    barcodeDataUrl = await renderCode128DataUrl(identifier, 32, false, 0);
  }

  return { qrDataUrl, barcodeDataUrl };
}

function fitImage(
  imgW: number,
  imgH: number,
  maxW: number,
  maxH: number,
): { w: number; h: number } {
  if (imgW <= 0 || imgH <= 0) return { w: maxW, h: maxH };
  const scale = Math.min(maxW / imgW, maxH / imgH, 1);
  return { w: imgW * scale, h: imgH * scale };
}

async function embedPng(pdf: PDFDocument, dataUrl: string): Promise<PDFImage> {
  return pdf.embedPng(pngBytesFromDataUrl(dataUrl));
}

async function drawLabelInRect(
  page: PDFPage,
  fonts: LabelFonts,
  label: BulkLabelRow,
  qrDataUrl: string | null,
  barcodeDataUrl: string | null,
  codeType: CodeMarkType,
  cellLeft: number,
  cellBottom: number,
  labelW: number,
  labelH: number,
  pdf: PDFDocument,
): Promise<void> {
  const pad = 1.5 * MM;
  const innerW = labelW - pad * 2;
  const cellTop = cellBottom + labelH;
  const centerX = cellLeft + labelW / 2;
  const lineGap = 0.35 * MM;
  const gapAfterCode = 0.4 * MM;

  const idSize = Math.min(9, labelH * 0.11);
  const titleSize = Math.min(7, labelH * 0.085);
  const hasTitle = Boolean(label.title && label.title !== label.identifier);
  const textBlockH = (hasTitle ? idSize + titleSize + lineGap * 3 : idSize + lineGap * 2);

  let yTop = cellTop - pad;

  const drawTextLine = (text: string, size: number, color = rgb(0, 0, 0)) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const maxChars = Math.floor(innerW / (size * 0.45));
    const line = trimmed.length > maxChars ? `${trimmed.slice(0, maxChars - 3)}...` : trimmed;
    yTop -= lineGap;
    yTop -= size;
    drawMixedTextLine(page, fonts, line, centerX, yTop, size, color);
  };

  const codeMaxH = Math.max(6 * MM, labelH - pad * 2 - textBlockH - gapAfterCode);

  if ((codeType === "qr" || codeType === "both") && qrDataUrl) {
    const png = await embedPng(pdf, qrDataUrl);
    const maxW = codeType === "both" ? innerW * 0.52 : innerW;
    const { w, h } = fitImage(png.width, png.height, maxW, codeMaxH);
    const x = codeType === "both" ? cellLeft + pad : cellLeft + (labelW - w) / 2;
    yTop -= h;
    page.drawImage(png, { x, y: yTop, width: w, height: h });
    yTop -= gapAfterCode;
  }

  if ((codeType === "barcode" || codeType === "both") && barcodeDataUrl) {
    const png = await embedPng(pdf, barcodeDataUrl);
    const maxW = codeType === "both" ? innerW * 0.44 : innerW;
    const maxH = codeType === "both" ? codeMaxH * 0.55 : Math.min(codeMaxH, 11 * MM);
    const { w, h } = fitImage(png.width, png.height, maxW, maxH);
    const x = codeType === "both" ? cellLeft + labelW - pad - w : cellLeft + (labelW - w) / 2;
    if (codeType === "both") {
      const y = cellTop - pad - h;
      page.drawImage(png, { x, y, width: w, height: h });
    } else {
      yTop -= h;
      page.drawImage(png, { x, y: yTop, width: w, height: h });
      yTop -= gapAfterCode;
    }
  }

  drawTextLine(label.identifier, idSize);
  if (hasTitle && label.title) {
    drawTextLine(label.title, titleSize, rgb(0.35, 0.35, 0.35));
  }
}

export async function generateInventoryBatchPdf(
  labels: BulkLabelRow[],
  qrDataUrls: (string | null)[],
  barcodeDataUrls: (string | null)[],
  options: BulkPdfOptions,
): Promise<void> {
  const { codeType, labelFormat = "58x40", filename = "qhub-labels.pdf" } = options;
  const pdf = await PDFDocument.create();
  const fonts = await loadLabelFonts(pdf);
  const { w: labelW, h: labelH } = getLabelDimensions(labelFormat);
  const cols = Math.max(1, Math.floor(A4.w / labelW));
  const rowsPerPage = Math.max(1, Math.floor(A4.h / labelH));
  const perPage = cols * rowsPerPage;

  let page = pdf.addPage([A4.w, A4.h]);
  let col = 0;
  let row = 0;

  for (let i = 0; i < labels.length; i++) {
    if (i > 0 && i % perPage === 0) {
      page = pdf.addPage([A4.w, A4.h]);
      col = 0;
      row = 0;
    }

    const cellLeft = col * labelW;
    const cellBottom = A4.h - (row + 1) * labelH;

    await drawLabelInRect(
      page,
      fonts,
      labels[i]!,
      qrDataUrls[i] ?? null,
      barcodeDataUrls[i] ?? null,
      codeType,
      cellLeft,
      cellBottom,
      labelW,
      labelH,
      pdf,
    );

    col++;
    if (col >= cols) {
      col = 0;
      row++;
    }
  }

  const bytes = await pdf.save();
  saveAs(new Blob([bytes as BlobPart], { type: "application/pdf" }), filename);
}

/** Одна метка на листе A4 в реальном размере (мм), по центру. */
export async function generateSingleInventoryLabelPdf(
  label: BulkLabelRow,
  images: LabelCodeImages,
  options: BulkPdfOptions,
): Promise<void> {
  const { codeType, labelFormat = "58x40", filename = "qhub-label.pdf" } = options;
  const pdf = await PDFDocument.create();
  const fonts = await loadLabelFonts(pdf);
  const page = pdf.addPage([A4.w, A4.h]);
  const { w: labelW, h: labelH } = getLabelDimensions(labelFormat);
  const cellLeft = (A4.w - labelW) / 2;
  const cellBottom = (A4.h - labelH) / 2;

  page.drawRectangle({
    x: cellLeft,
    y: cellBottom,
    width: labelW,
    height: labelH,
    borderColor: rgb(0.85, 0.85, 0.85),
    borderWidth: 0.5,
  });

  await drawLabelInRect(
    page,
    fonts,
    label,
    images.qrDataUrl,
    images.barcodeDataUrl,
    codeType,
    cellLeft,
    cellBottom,
    labelW,
    labelH,
    pdf,
  );

  const bytes = await pdf.save();
  saveAs(new Blob([bytes as BlobPart], { type: "application/pdf" }), filename);
}

export async function generateBulkLabelsPdf(
  labels: BulkLabelRow[],
  qrDataUrls: (string | null)[],
  barcodeDataUrls: (string | null)[],
  codeType: CodeMarkType,
): Promise<void> {
  await generateInventoryBatchPdf(labels, qrDataUrls, barcodeDataUrls, {
    codeType,
    labelFormat: "58x40",
    filename: "qhub-labels.pdf",
  });
}

export function parseBulkList(text: string): BulkLabelRow[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/[;\t|]/).map((p) => p.trim());
      return { identifier: parts[0] ?? "", title: parts[1] };
    })
    .filter((r) => r.identifier);
}

export function generateRangeList(prefix: string, start: number, end: number): BulkLabelRow[] {
  const rows: BulkLabelRow[] = [];
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  const pad = String(hi).length;
  for (let i = lo; i <= hi; i++) {
    rows.push({ identifier: `${prefix}${String(i).padStart(pad, "0")}` });
  }
  return rows;
}

export function labelFormatClass(format: LabelFormat): string {
  switch (format) {
    case "40x30":
      return "qr-label-40x30";
    case "58x40":
      return "qr-label-58x40";
    case "mini-20":
      return "qr-label-mini-20";
    case "mini-25":
      return "qr-label-mini-25";
    case "mini-30":
      return "qr-label-mini-30";
    case "a4-grid":
      return "qr-label-a4-grid";
    default:
      return "qr-label-standard";
  }
}
