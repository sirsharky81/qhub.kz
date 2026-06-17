import type { ErrorCorrectionLevel } from "./types";

export const MAX_LOGO_AREA_PERCENT = 25;

export function clampLogoSizePercent(percent: number): number {
  return Math.min(Math.max(percent, 5), MAX_LOGO_AREA_PERCENT);
}

export function effectiveErrorCorrection(
  level: ErrorCorrectionLevel,
  hasLogo: boolean,
): ErrorCorrectionLevel {
  if (!hasLogo) return level;
  const order: ErrorCorrectionLevel[] = ["L", "M", "Q", "H"];
  const idx = order.indexOf(level);
  return order[Math.max(idx, order.indexOf("H"))];
}

export async function applyLogoOverlay(
  qrDataUrl: string,
  logoDataUrl: string,
  qrSize: number,
  logoSizePercent: number,
): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = qrSize;
  canvas.height = qrSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) return qrDataUrl;

  const qrImg = await loadImage(qrDataUrl);
  ctx.drawImage(qrImg, 0, 0, qrSize, qrSize);

  const logoSide = Math.round(qrSize * (clampLogoSizePercent(logoSizePercent) / 100));
  const logoX = (qrSize - logoSide) / 2;
  const logoY = (qrSize - logoSide) / 2;

  const pad = Math.round(logoSide * 0.12);
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.roundRect(logoX - pad, logoY - pad, logoSide + pad * 2, logoSide + pad * 2, pad);
  ctx.fill();

  const logoImg = await loadImage(logoDataUrl);
  ctx.drawImage(logoImg, logoX, logoY, logoSide, logoSide);

  return canvas.toDataURL("image/png");
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
