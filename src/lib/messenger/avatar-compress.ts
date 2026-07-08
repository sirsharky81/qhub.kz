import { AVATAR_MAX_DIM, MAX_AVATAR_BYTES } from "./constants";

export type AvatarCropRect = {
  /** Percent of natural image width/height (0–100). */
  x: number;
  y: number;
  width: number;
  height: number;
};

export type AvatarPanZoom = {
  /** Display pixels per natural image pixel. */
  scale: number;
  /** Image center in viewport coordinates (px). */
  cx: number;
  cy: number;
};

async function blobFromCanvas(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("compress failed"))),
      "image/jpeg",
      quality,
    );
  });
}

async function compressCanvas(canvas: HTMLCanvasElement): Promise<{ blob: Blob; mime: string }> {
  let quality = 0.85;
  let blob = await blobFromCanvas(canvas, quality);
  while (blob.size > MAX_AVATAR_BYTES && quality > 0.45) {
    quality -= 0.1;
    blob = await blobFromCanvas(canvas, quality);
  }
  if (blob.size > MAX_AVATAR_BYTES) {
    throw new Error("Аватар слишком большой даже после сжатия");
  }
  return { blob, mime: "image/jpeg" };
}

/** Export circular avatar from pan/zoom transform (viewport coordinates). */
export async function exportCroppedAvatar(
  source: CanvasImageSource,
  naturalWidth: number,
  naturalHeight: number,
  transform: AvatarPanZoom,
  viewportSize: number,
): Promise<{ blob: Blob; mime: string }> {
  const out = Math.min(AVATAR_MAX_DIM, viewportSize);
  const ratio = out / viewportSize;
  const scale = transform.scale * ratio;
  const cx = transform.cx * ratio;
  const cy = transform.cy * ratio;

  const canvas = document.createElement("canvas");
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Не удалось обработать изображение");

  ctx.beginPath();
  ctx.arc(out / 2, out / 2, out / 2, 0, Math.PI * 2);
  ctx.clip();

  const w = naturalWidth * scale;
  const h = naturalHeight * scale;
  ctx.drawImage(source, cx - w / 2, cy - h / 2, w, h);

  return compressCanvas(canvas);
}

/** Square-crop and compress an image for messenger avatars. */
export async function compressAvatarImage(
  file: File,
  crop?: AvatarCropRect | null,
): Promise<{ blob: Blob; mime: string }> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Выберите изображение");
  }
  const bitmap = await createImageBitmap(file);

  let sx: number;
  let sy: number;
  let side: number;

  if (crop && crop.width > 0 && crop.height > 0) {
    sx = Math.round((crop.x / 100) * bitmap.width);
    sy = Math.round((crop.y / 100) * bitmap.height);
    const sw = Math.round((crop.width / 100) * bitmap.width);
    const sh = Math.round((crop.height / 100) * bitmap.height);
    side = Math.max(1, Math.min(sw, sh, bitmap.width - sx, bitmap.height - sy));
    sx = Math.max(0, Math.min(sx, bitmap.width - side));
    sy = Math.max(0, Math.min(sy, bitmap.height - side));
  } else {
    side = Math.min(bitmap.width, bitmap.height);
    sx = Math.floor((bitmap.width - side) / 2);
    sy = Math.floor((bitmap.height - side) / 2);
  }

  const out = Math.min(side, AVATAR_MAX_DIM);
  const canvas = document.createElement("canvas");
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Не удалось обработать изображение");
  }
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, out, out);
  bitmap.close();

  return compressCanvas(canvas);
}
