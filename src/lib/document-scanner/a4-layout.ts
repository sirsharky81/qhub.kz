import type { ScanItem, ScanPage } from "./types";
import { applyFilters } from "./filters";
import { blobToCanvas } from "./canvas-utils";
import { getPageSizePx, resolveOrientation } from "./page-size";
import {
  computeDrawSize,
  getAvailArea,
  resolveWidthFrac,
} from "./layout-utils";

export async function renderPageToCanvas(
  page: ScanPage,
  width?: number,
  height?: number,
): Promise<HTMLCanvasElement> {
  const defaultSize = getPageSizePx(resolveOrientation(page));
  const w = width ?? defaultSize.width;
  const h = height ?? defaultSize.height;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, w, h);

  const { margin, availW, availH } = getAvailArea(w, h);

  for (const item of page.items) {
    const src = await blobToCanvas(item.imageBlob);
    const filtered = applyFilters(src, page.filter, page.adjustments);
    drawItem(ctx, filtered, item, page, margin, availW, availH);
  }

  return canvas;
}

function drawItem(
  ctx: CanvasRenderingContext2D,
  img: HTMLCanvasElement,
  item: ScanItem,
  page: ScanPage,
  margin: number,
  availW: number,
  availH: number,
): void {
  const widthFrac = resolveWidthFrac(item);
  const { drawW, drawH } = computeDrawSize(img.width, img.height, widthFrac, availW, availH);

  const cx = margin + item.x * availW;
  const cy = margin + item.y * availH;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((item.rotation * Math.PI) / 180);
  ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.restore();
}

export async function renderPageThumbnail(page: ScanPage, maxSize = 200): Promise<string> {
  const full = await renderPageToCanvas(page);
  const scale = maxSize / Math.max(full.width, full.height);
  const thumb = document.createElement("canvas");
  thumb.width = Math.round(full.width * scale);
  thumb.height = Math.round(full.height * scale);
  thumb.getContext("2d")!.drawImage(full, 0, 0, thumb.width, thumb.height);
  return thumb.toDataURL("image/jpeg", 0.7);
}

export { getAvailArea, computeDrawSize, resolveWidthFrac };
