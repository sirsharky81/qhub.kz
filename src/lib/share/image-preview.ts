import { isImageMime } from "./transfer-protocol";

export function isPreviewableImage(file: File | { type: string; name: string }): boolean {
  if (isImageMime(file.type)) return true;
  return /\.(jpe?g|png|gif|webp|heic|heif|bmp)$/i.test(file.name);
}

export function createObjectPreviewUrl(file: File): string | null {
  if (!isPreviewableImage(file)) return null;
  try {
    return URL.createObjectURL(file);
  } catch {
    return null;
  }
}

export function revokePreviewUrl(url: string | null | undefined): void {
  if (url) URL.revokeObjectURL(url);
}

export async function createBlobPreviewUrl(blob: Blob, name: string, type: string): Promise<string | null> {
  if (!isPreviewableImage({ type, name })) return null;
  try {
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}
