import type { CardFormat, ThemeId, VerificationRecord } from "./types";
import { SERVICE_URL } from "./types";
import { getTheme } from "./themes";

export async function generateResultCardPng(
  record: VerificationRecord,
  format: CardFormat,
  themeId: ThemeId,
): Promise<Blob> {
  const theme = getTheme(themeId);
  const width = 1080;
  const height = format === "1080x1080" ? 1080 : 1350;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, theme.gradientFrom);
  gradient.addColorStop(1, theme.gradientTo);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = theme.accent;
  ctx.font = "bold 48px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("QHub", width / 2, 100);

  ctx.fillStyle = theme.textSecondary;
  ctx.font = "28px system-ui, sans-serif";
  ctx.fillText("Генератор случайных чисел", width / 2, 145);

  ctx.fillStyle = theme.textPrimary;
  ctx.font = "36px system-ui, sans-serif";
  const eventLines = wrapCanvasText(ctx, record.eventName, width - 120);
  let y = 220;
  for (const line of eventLines) {
    ctx.fillText(line, width / 2, y);
    y += 44;
  }

  y += 30;
  ctx.fillStyle = theme.accent;
  ctx.font = "bold 64px system-ui, sans-serif";
  const resultLines = wrapCanvasText(ctx, record.result.split("\n")[0] ?? record.result, width - 80);
  for (const line of resultLines.slice(0, 3)) {
    ctx.fillText(line, width / 2, y);
    y += 72;
  }

  y += 20;
  ctx.fillStyle = theme.textSecondary;
  ctx.font = "32px system-ui, sans-serif";
  ctx.fillText(`Участников: ${record.participantCount}`, width / 2, y);
  y += 50;
  ctx.fillText(record.date, width / 2, y);

  ctx.fillStyle = theme.textMuted;
  ctx.font = "24px system-ui, sans-serif";
  ctx.fillText("QHub.kz", width / 2, height - 80);
  ctx.fillText(SERVICE_URL, width / 2, height - 45);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Failed to create PNG"))),
      "image/png",
    );
  });
}

function wrapCanvasText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [text];
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
