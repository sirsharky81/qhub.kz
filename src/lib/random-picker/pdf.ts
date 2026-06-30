import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import QRCode from "qrcode";
import { saveBlobToDevice } from "@/lib/platform/save-file";
import type { ProtocolTitle, VerificationRecord } from "./types";
import { LEGAL_DISCLAIMER, SERVICE_URL } from "./types";

const FONT_REGULAR = "/fonts/Roboto-Regular.woff2";
const FONT_BOLD = "/fonts/Roboto-Bold.woff2";

const C = {
  ink: rgb(0.06, 0.09, 0.16),
  inkSoft: rgb(0.28, 0.33, 0.41),
  muted: rgb(0.55, 0.58, 0.65),
  line: rgb(0.89, 0.91, 0.94),
  accent: rgb(0.15, 0.39, 0.92),
  accentSoft: rgb(0.93, 0.95, 0.99),
  white: rgb(1, 1, 1),
  resultBg: rgb(0.96, 0.98, 1),
};

function protocolTitle(mode: VerificationRecord["mode"]): ProtocolTitle {
  switch (mode) {
    case "wheel":
    case "pick":
      return "ПРОТОКОЛ СЛУЧАЙНОГО ВЫБОРА";
    case "shuffle":
      return "ПРОТОКОЛ ПЕРЕМЕШИВАНИЯ СПИСКА";
    case "groups":
      return "ПРОТОКОЛ РАСПРЕДЕЛЕНИЯ ПО ГРУППАМ";
    case "number":
      return "ПРОТОКОЛ ЖЕРЕБЬЁВКИ";
    default:
      return "ПРОТОКОЛ ЖЕРЕБЬЁВКИ";
  }
}

async function loadCyrillicFonts(pdf: PDFDocument) {
  pdf.registerFontkit(fontkit);
  const [regularBytes, boldBytes] = await Promise.all([
    fetch(FONT_REGULAR).then((r) => r.arrayBuffer()),
    fetch(FONT_BOLD).then((r) => r.arrayBuffer()),
  ]);
  const font = await pdf.embedFont(new Uint8Array(regularBytes));
  const fontBold = await pdf.embedFont(new Uint8Array(boldBytes));
  return { font, fontBold };
}

function wrapText(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (paragraph.length <= maxChars) {
      lines.push(paragraph);
      continue;
    }
    let remaining = paragraph;
    while (remaining.length > maxChars) {
      let breakAt = remaining.lastIndexOf(" ", maxChars);
      if (breakAt < maxChars * 0.4) breakAt = maxChars;
      lines.push(remaining.slice(0, breakAt));
      remaining = remaining.slice(breakAt).trimStart();
    }
    if (remaining) lines.push(remaining);
  }
  return lines.length ? lines : [""];
}

function formatParticipantsList(participants: readonly string[]): {
  text: string;
  note?: string;
  twoColumns: boolean;
} {
  const total = participants.length;
  if (total > 2000) {
    return {
      text: participants.slice(0, 1000).join(", "),
      note: `Показаны первые 1 000 из ${total} участников. Полный список доступен при копировании результата.`,
      twoColumns: true,
    };
  }
  return { text: participants.join(", "), twoColumns: total >= 500 };
}

export async function generateProtocolPdf(record: VerificationRecord): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const { font, fontBold } = await loadCyrillicFonts(pdf);

  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 44;
  const contentWidth = pageWidth - margin * 2;
  const lineHeight = 14;
  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight;

  const newPageIfNeeded = (needed: number) => {
    if (y - needed < margin + 72) {
      page = pdf.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
      return true;
    }
    return false;
  };

  const drawHeader = () => {
    const headerH = 88;
    page.drawRectangle({ x: 0, y: pageHeight - headerH, width: pageWidth, height: headerH, color: C.ink });
    page.drawRectangle({ x: 0, y: pageHeight - headerH - 3, width: pageWidth, height: 3, color: C.accent });

    page.drawText("QHub", {
      x: margin,
      y: pageHeight - 38,
      size: 22,
      font: fontBold,
      color: C.white,
    });
    page.drawText(".kz", {
      x: margin + fontBold.widthOfTextAtSize("QHub", 22),
      y: pageHeight - 38,
      size: 22,
      font,
      color: rgb(0.75, 0.78, 0.85),
    });
    page.drawText("Генератор случайных чисел", {
      x: margin,
      y: pageHeight - 56,
      size: 9,
      font,
      color: rgb(0.65, 0.7, 0.8),
    });
    page.drawText(protocolTitle(record.mode), {
      x: margin,
      y: pageHeight - 74,
      size: 11,
      font: fontBold,
      color: C.white,
    });

    const metaRight = `${record.date}  ·  ${record.time}`;
    const metaW = font.widthOfTextAtSize(metaRight, 8);
    page.drawText(metaRight, {
      x: pageWidth - margin - metaW,
      y: pageHeight - 56,
      size: 8,
      font,
      color: rgb(0.65, 0.7, 0.8),
    });

    y = pageHeight - headerH - 24;
  };

  drawHeader();

  const drawLabel = (text: string) => {
    newPageIfNeeded(lineHeight * 2);
    page.drawText(text.toUpperCase(), {
      x: margin,
      y,
      size: 7,
      font: fontBold,
      color: C.muted,
    });
    y -= 12;
  };

  const drawValue = (text: string, size = 10, bold = false) => {
    for (const line of wrapText(text, 72)) {
      newPageIfNeeded(lineHeight);
      page.drawText(line, {
        x: margin,
        y,
        size,
        font: bold ? fontBold : font,
        color: C.ink,
        maxWidth: contentWidth,
      });
      y -= lineHeight;
    }
  };

  const drawMetaGrid = () => {
    const items = [
      { label: "Мероприятие", value: record.eventName },
      ...(record.keyColumn ? [{ label: "Поле выбора", value: record.keyColumn }] : []),
      { label: "Участников", value: String(record.participantCount) },
      { label: "Дата", value: record.date },
      { label: "Время", value: record.time },
    ];
    if (record.description) items.splice(1, 0, { label: "Описание", value: record.description });
    if (record.contact) items.push({ label: "Контакт", value: record.contact });

    const boxH = 58;
    newPageIfNeeded(boxH + 8);
    page.drawRectangle({
      x: margin,
      y: y - boxH,
      width: contentWidth,
      height: boxH,
      color: C.accentSoft,
      borderColor: C.line,
      borderWidth: 1,
    });

    const colW = contentWidth / 2;
    items.slice(0, 4).forEach((item, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = margin + 12 + col * colW;
      const yy = y - 14 - row * 24;
      page.drawText(item.label.toUpperCase(), { x, y: yy, size: 6.5, font: fontBold, color: C.muted });
      page.drawText(item.value.slice(0, 42), { x, y: yy - 11, size: 9, font, color: C.ink, maxWidth: colW - 16 });
    });
    y -= boxH + 16;
  };

  drawMetaGrid();

  drawLabel("Результат");
  const resultLines = wrapText(record.result, 68);
  const resultBoxH = Math.max(36, resultLines.length * lineHeight + 16);
  newPageIfNeeded(resultBoxH + 8);
  page.drawRectangle({
    x: margin,
    y: y - resultBoxH,
    width: contentWidth,
    height: resultBoxH,
    color: C.resultBg,
    borderColor: C.accent,
    borderWidth: 1,
  });
  let ry = y - 14;
  for (const line of resultLines) {
    page.drawText(line, { x: margin + 12, y: ry, size: 12, font: fontBold, color: C.ink, maxWidth: contentWidth - 24 });
    ry -= lineHeight + 2;
  }
  y -= resultBoxH + 16;

  drawLabel("Исходный список участников");
  const { text, note, twoColumns } = formatParticipantsList(record.participants);
  if (twoColumns) {
    const names = text.split(", ");
    const mid = Math.ceil(names.length / 2);
    const left = names.slice(0, mid);
    const right = names.slice(mid);
    const maxRows = Math.max(left.length, right.length);
    const colWidth = contentWidth / 2 - 8;
    for (let i = 0; i < maxRows; i++) {
      newPageIfNeeded(lineHeight);
      if (left[i]) page.drawText(left[i]!, { x: margin, y, size: 8, font, color: C.inkSoft, maxWidth: colWidth });
      if (right[i]) page.drawText(right[i]!, { x: margin + colWidth + 16, y, size: 8, font, color: C.inkSoft, maxWidth: colWidth });
      y -= lineHeight;
    }
  } else {
    drawValue(text, 9);
  }
  if (note) drawValue(note, 8);
  y -= 8;

  drawLabel("Проверка");
  page.drawRectangle({
    x: margin,
    y: y - 52,
    width: contentWidth,
    height: 52,
    color: rgb(0.98, 0.98, 0.99),
    borderColor: C.line,
    borderWidth: 1,
  });
  page.drawText(`Seed: ${record.seed}`, { x: margin + 10, y: y - 16, size: 7.5, font, color: C.inkSoft, maxWidth: contentWidth - 20 });
  page.drawText(`Hash: ${record.verificationHash}`, { x: margin + 10, y: y - 30, size: 7.5, font, color: C.inkSoft, maxWidth: contentWidth - 20 });
  page.drawText("SHA-256 · Web Crypto API", { x: margin + 10, y: y - 44, size: 6.5, font, color: C.muted });
  y -= 68;

  newPageIfNeeded(120);
  const qrDataUrl = await QRCode.toDataURL(SERVICE_URL, { margin: 1, width: 120 });
  const qrBytes = Uint8Array.from(atob(qrDataUrl.split(",")[1]!), (c) => c.charCodeAt(0));
  const qrImage = await pdf.embedPng(qrBytes);

  page.drawLine({ start: { x: margin, y: y }, end: { x: pageWidth - margin, y: y }, thickness: 1, color: C.line });
  y -= 16;

  page.drawImage(qrImage, { x: margin, y: y - 56, width: 48, height: 48 });
  page.drawText("Сформировано сервисом", { x: margin + 60, y: y - 18, size: 8, font, color: C.muted });
  page.drawText("Генератор случайных чисел", { x: margin + 60, y: y - 32, size: 11, font: fontBold, color: C.ink });
  page.drawText("https://qhub.kz", { x: margin + 60, y: y - 46, size: 10, font: fontBold, color: C.accent });
  page.drawText(SERVICE_URL, { x: margin + 60, y: y - 58, size: 7.5, font, color: C.muted });

  y -= 72;

  const disclaimerLines = wrapText(LEGAL_DISCLAIMER, 95);
  for (const line of disclaimerLines) {
    newPageIfNeeded(9);
    page.drawText(line, { x: margin, y, size: 6, font, color: C.muted, maxWidth: contentWidth });
    y -= 8;
  }

  return pdf.save();
}

export function downloadPdf(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
  void saveBlobToDevice(blob, filename);
}
