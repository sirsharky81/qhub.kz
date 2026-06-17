import { PDFDocument, rgb } from "pdf-lib";
import { saveAs } from "file-saver";

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

async function loadPngBytes(dataUrl: string): Promise<Uint8Array> {
  const res = await fetch(dataUrl);
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

export async function generateBulkLabelsPdf(
  labels: BulkLabelRow[],
  qrDataUrls: (string | null)[],
  barcodeDataUrls: (string | null)[],
  codeType: CodeMarkType,
): Promise<void> {
  const pdf = await PDFDocument.create();
  const labelW = 58 * MM;
  const labelH = 40 * MM;
  const cols = Math.floor(A4.w / labelW);
  const rows = Math.floor(A4.h / labelH);
  const perPage = cols * rows;

  let page = pdf.addPage([A4.w, A4.h]);
  let col = 0;
  let row = 0;

  for (let i = 0; i < labels.length; i++) {
    const idx = i;
    if (i > 0 && i % perPage === 0) {
      page = pdf.addPage([A4.w, A4.h]);
      col = 0;
      row = 0;
    }

    const x = col * labelW + 4;
    const y = A4.h - (row + 1) * labelH + 4;
    const label = labels[i]!;

    const codeSize = 28 * MM;
    let offsetX = x + (labelW - codeSize) / 2;

    if ((codeType === "qr" || codeType === "both") && qrDataUrls[idx]) {
      const png = await pdf.embedPng(await loadPngBytes(qrDataUrls[idx]!));
      const sz = codeType === "both" ? codeSize * 0.55 : codeSize;
      page.drawImage(png, {
        x: codeType === "both" ? x + 4 : offsetX,
        y: y + labelH - sz - 14,
        width: sz,
        height: sz,
      });
    }

    if ((codeType === "barcode" || codeType === "both") && barcodeDataUrls[idx]) {
      const png = await pdf.embedPng(await loadPngBytes(barcodeDataUrls[idx]!));
      const bw = codeType === "both" ? labelW * 0.42 : labelW - 8;
      const bh = codeType === "both" ? 10 * MM : 12 * MM;
      page.drawImage(png, {
        x: codeType === "both" ? x + labelW - bw - 4 : x + 4,
        y: y + labelH - bh - 14,
        width: bw,
        height: bh,
      });
    }

    page.drawText(label.identifier.slice(0, 24), {
      x: x + 4,
      y: y + 10,
      size: 9,
      color: rgb(0, 0, 0),
    });
    if (label.title) {
      page.drawText(label.title.slice(0, 28), {
        x: x + 4,
        y: y + 2,
        size: 7,
        color: rgb(0.3, 0.3, 0.3),
      });
    }

    col++;
    if (col >= cols) {
      col = 0;
      row++;
    }
  }

  const bytes = await pdf.save();
  saveAs(new Blob([bytes as BlobPart], { type: "application/pdf" }), "qhub-labels.pdf");
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
