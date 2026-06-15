import type { FilterMode, PageAdjustments } from "./types";

export function applyFilters(
  canvas: HTMLCanvasElement,
  filter: FilterMode,
  adjustments: PageAdjustments,
): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = canvas.width;
  out.height = canvas.height;
  const ctx = out.getContext("2d")!;
  ctx.drawImage(canvas, 0, 0);

  const imageData = ctx.getImageData(0, 0, out.width, out.height);
  const data = imageData.data;

  const brightness = adjustments.brightness * 2.55;
  const contrastFactor = (259 * (adjustments.contrast + 255)) / (255 * (259 - adjustments.contrast));

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i]!;
    let g = data[i + 1]!;
    let b = data[i + 2]!;

    if (filter === "enhanced") {
      [r, g, b] = enhanceDocument(r, g, b);
    } else if (filter === "bw") {
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      const bw = gray > 140 ? 255 : gray > 100 ? 200 : 0;
      r = g = b = bw;
    } else if (filter === "grayscale") {
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      r = g = b = gray;
    }

    r = clamp(contrastFactor * (r - 128) + 128 + brightness);
    g = clamp(contrastFactor * (g - 128) + 128 + brightness);
    b = clamp(contrastFactor * (b - 128) + 128 + brightness);

    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }

  ctx.putImageData(imageData, 0, 0);
  return out;
}

function enhanceDocument(r: number, g: number, b: number): [number, number, number] {
  const gray = 0.299 * r + 0.587 * g + 0.114 * b;
  const contrast = clamp((gray - 128) * 1.4 + 128);
  const shadowLift = gray < 80 ? (80 - gray) * 0.3 : 0;
  const highlight = gray > 200 ? (gray - 200) * 0.15 : 0;
  const v = clamp(contrast + shadowLift - highlight);
  return [v, v, v];
}

function clamp(v: number): number {
  return Math.min(255, Math.max(0, Math.round(v)));
}

export const FILTER_LABELS: Record<FilterMode, string> = {
  color: "Цветной",
  bw: "Ч/Б",
  grayscale: "Оттенки серого",
  enhanced: "Улучшение",
};
