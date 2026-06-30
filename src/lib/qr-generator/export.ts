import { saveBlobToDevice } from "@/lib/platform/save-file";

export async function downloadPng(dataUrl: string, filename = "qrcode.png"): Promise<void> {
  const blob = await dataUrlToBlob(dataUrl);
  await saveBlobToDevice(blob, filename);
}

export async function downloadPngTransparent(
  dataUrl: string,
  backgroundColor: string,
  filename = "qrcode-transparent.png",
): Promise<void> {
  const transparent = await makeTransparentBackground(dataUrl, backgroundColor);
  const blob = await dataUrlToBlob(transparent);
  await saveBlobToDevice(blob, filename);
}

export function downloadSvg(svg: string, filename = "qrcode.svg"): void {
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  void saveBlobToDevice(blob, filename);
}

export async function downloadJpg(dataUrl: string, filename = "qrcode.jpg"): Promise<void> {
  const blob = await dataUrlToJpgBlob(dataUrl);
  await saveBlobToDevice(blob, filename);
}

export async function copyQrToClipboard(dataUrl: string): Promise<void> {
  const blob = await dataUrlToBlob(dataUrl);
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

async function dataUrlToJpgBlob(dataUrl: string): Promise<Blob> {
  const img = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("JPG export failed"))),
      "image/jpeg",
      0.92,
    );
  });
}

async function makeTransparentBackground(dataUrl: string, bgColor: string): Promise<string> {
  const img = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const target = hexToRgb(bgColor);
  if (!target) return dataUrl;
  const tolerance = 24;
  for (let i = 0; i < imageData.data.length; i += 4) {
    const r = imageData.data[i];
    const g = imageData.data[i + 1];
    const b = imageData.data[i + 2];
    if (
      Math.abs(r - target.r) <= tolerance &&
      Math.abs(g - target.g) <= tolerance &&
      Math.abs(b - target.b) <= tolerance
    ) {
      imageData.data[i + 3] = 0;
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.replace("#", "");
  if (h.length === 6) {
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  }
  return null;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
