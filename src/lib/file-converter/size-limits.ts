import type { DeviceType, FileCategory } from "./types";

const MB = 1024 * 1024;

const LIMITS_MB: Record<FileCategory, number | Record<DeviceType, number>> = {
  image: 100,
  audio: 300,
  video: { iphone: 300, android: 500, desktop: 2048 },
  ebook: 100,
  pdf: 200,
  spreadsheet: 100,
  unknown: 50,
};

export function detectDeviceType(): DeviceType {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return "iphone";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

export function getSizeLimitBytes(category: FileCategory, device: DeviceType): number {
  const limit = LIMITS_MB[category];
  if (typeof limit === "number") return limit * MB;
  if (category === "video") {
    return (limit[device] ?? limit.desktop) * MB;
  }
  return 50 * MB;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < MB) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * MB) return `${(bytes / MB).toFixed(1)} MB`;
  return `${(bytes / (1024 * MB)).toFixed(2)} GB`;
}

export function checkSizeLimit(
  size: number,
  category: FileCategory,
  device: DeviceType,
): { ok: boolean; limitBytes: number } {
  const limitBytes = getSizeLimitBytes(category, device);
  return { ok: size <= limitBytes, limitBytes };
}
