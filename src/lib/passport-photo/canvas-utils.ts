import { PhotoSize, PaperSize, PhotoCount, MARGIN_PX, cmToPx, MARGIN_CM } from "./dimensions";

/**
 * Crops the source image to the given pixel rectangle and returns a Blob
 * at the photo's exact print resolution.
 */
export async function cropImageToBlob(
  sourceImage: HTMLImageElement,
  cropX: number,
  cropY: number,
  cropWidth: number,
  cropHeight: number,
  photoSize: PhotoSize
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = photoSize.widthPx;
  canvas.height = photoSize.heightPx;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(
    sourceImage,
    cropX, cropY, cropWidth, cropHeight,
    0, 0, photoSize.widthPx, photoSize.heightPx
  );
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Canvas toBlob failed"))), "image/jpeg", 0.95);
  });
}

/**
 * Composes 1, 4, or 6 passport photos on a paper-sized canvas.
 * Photos are arranged in a grid with uniform margins.
 */
export async function composeLayout(
  photoBlob: Blob,
  photoSize: PhotoSize,
  paperSize: PaperSize,
  count: PhotoCount,
  bgColor: string
): Promise<Blob> {
  const photoImg = await blobToImage(photoBlob);

  const canvas = document.createElement("canvas");
  canvas.width = paperSize.widthPx;
  canvas.height = paperSize.heightPx;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const photoPx = { w: photoSize.widthPx, h: photoSize.heightPx };
  const gapPx = MARGIN_PX;
  const borderPx = MARGIN_PX;

  const { columns, rows } = bestGrid(count, photoPx, paperSize);

  const totalGridW = columns * photoPx.w + (columns - 1) * gapPx;
  const totalGridH = rows * photoPx.h + (rows - 1) * gapPx;
  const startX = Math.floor((canvas.width - totalGridW) / 2);
  const startY = Math.floor((canvas.height - totalGridH) / 2);

  let placed = 0;
  for (let r = 0; r < rows && placed < count; r++) {
    for (let c = 0; c < columns && placed < count; c++) {
      const x = startX + c * (photoPx.w + gapPx);
      const y = startY + r * (photoPx.h + gapPx);
      ctx.drawImage(photoImg, x, y, photoPx.w, photoPx.h);
      placed++;
    }
  }

  void bgColor; void borderPx;

  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Canvas toBlob failed"))), "image/jpeg", 0.95);
  });
}

function bestGrid(count: PhotoCount, photo: { w: number; h: number }, paper: PaperSize) {
  const usableW = paper.widthPx - 2 * MARGIN_PX;
  const usableH = paper.heightPx - 2 * MARGIN_PX;

  if (count === 1) return { columns: 1, rows: 1 };

  const candidates: Array<{ columns: number; rows: number }> = [];
  for (let c = 1; c <= count; c++) {
    for (let r = 1; r <= count; r++) {
      if (c * r >= count) {
        const neededW = c * photo.w + (c - 1) * MARGIN_PX;
        const neededH = r * photo.h + (r - 1) * MARGIN_PX;
        if (neededW <= usableW && neededH <= usableH) {
          candidates.push({ columns: c, rows: r });
        }
      }
    }
  }

  if (candidates.length === 0) {
    return { columns: count === 4 ? 2 : 3, rows: count === 4 ? 2 : 2 };
  }

  candidates.sort((a, b) => {
    const aWaste = a.columns * a.rows - count;
    const bWaste = b.columns * b.rows - count;
    return aWaste - bWaste;
  });

  return candidates[0];
}

function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = reject;
    img.src = url;
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Applies a background color to an image that has a transparent background (PNG).
 * Returns a new Blob with the background filled.
 */
export async function applyBackground(
  sourceBlob: Blob,
  bgColor: string,
  photoSize: PhotoSize
): Promise<Blob> {
  const img = await blobToImage(sourceBlob);
  const canvas = document.createElement("canvas");
  canvas.width = photoSize.widthPx;
  canvas.height = photoSize.heightPx;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Canvas toBlob failed"))), "image/jpeg", 0.95);
  });
}

/**
 * Applies a solid background to a raw cropped image (no AI — just color overlay behind photo).
 */
export async function applyBackgroundOverlay(
  sourceBlob: Blob,
  bgColor: string
): Promise<Blob> {
  const img = await blobToImage(sourceBlob);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Canvas toBlob failed"))), "image/jpeg", 0.95);
  });
}

export function cmToPxUtil(cm: number) { return cmToPx(cm); }
