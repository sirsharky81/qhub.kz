/** A4 at 300 DPI — used for raster export */
export const A4_WIDTH_PX = 2480;
export const A4_HEIGHT_PX = 3508;

/** A4 in PDF points (72 DPI) */
export const A4_WIDTH_PT = 595.28;
export const A4_HEIGHT_PT = 841.89;

/** Max upload size — 50 MB per spec */
export const MAX_FILE_SIZE = 50 * 1024 * 1024;

export const QUALITY_PRESETS = {
  high: { jpeg: 0.92, webp: 0.9, pdfScale: 1 },
  medium: { jpeg: 0.82, webp: 0.8, pdfScale: 0.75 },
  low: { jpeg: 0.65, webp: 0.65, pdfScale: 0.5 },
} as const;

export function defaultScanFilename(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `Scan_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
