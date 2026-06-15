import type { NormPoint, Point } from "./types";

/** Fast perspective warp via two affine triangle draws (GPU-accelerated). */
export function warpPerspectiveFast(
  source: HTMLCanvasElement,
  corners: NormPoint[],
  outWidth: number,
  outHeight: number,
): HTMLCanvasElement {
  const sw = source.width;
  const sh = source.height;
  const src = corners.map((c) => normToPixel(c, sw, sh));

  const out = document.createElement("canvas");
  out.width = outWidth;
  out.height = outHeight;
  const ctx = out.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, outWidth, outHeight);

  const dst = [
    { x: 0, y: 0 },
    { x: outWidth, y: 0 },
    { x: outWidth, y: outHeight },
    { x: 0, y: outHeight },
  ];

  // Quad split: TL-TR-BL and TR-BR-BL
  drawImageTriangle(ctx, source, [src[0]!, src[1]!, src[3]!], [dst[0]!, dst[1]!, dst[3]!]);
  drawImageTriangle(ctx, source, [src[1]!, src[2]!, src[3]!], [dst[1]!, dst[2]!, dst[3]!]);

  return out;
}

function drawImageTriangle(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  src: [Point, Point, Point],
  dst: [Point, Point, Point],
): void {
  const [s0, s1, s2] = src;
  const [d0, d1, d2] = dst;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(d0.x, d0.y);
  ctx.lineTo(d1.x, d1.y);
  ctx.lineTo(d2.x, d2.y);
  ctx.closePath();
  ctx.clip();

  const denom = s0.x * (s1.y - s2.y) + s1.x * (s2.y - s0.y) + s2.x * (s0.y - s1.y);
  if (Math.abs(denom) < 1e-8) {
    ctx.restore();
    return;
  }

  ctx.transform(
    (d0.x * (s1.y - s2.y) + d1.x * (s2.y - s0.y) + d2.x * (s0.y - s1.y)) / denom,
    (d0.y * (s1.y - s2.y) + d1.y * (s2.y - s0.y) + d2.y * (s0.y - s1.y)) / denom,
    (d0.x * (s2.x - s1.x) + d1.x * (s0.x - s2.x) + d2.x * (s1.x - s0.x)) / denom,
    (d0.y * (s2.x - s1.x) + d1.y * (s0.x - s2.x) + d2.y * (s1.x - s0.x)) / denom,
    (d0.x * (s1.x * s2.y - s2.x * s1.y) + d1.x * (s2.x * s0.y - s0.x * s2.y) + d2.x * (s0.x * s1.y - s1.x * s0.y)) /
      denom,
    (d0.y * (s1.x * s2.y - s2.x * s1.y) + d1.y * (s2.x * s0.y - s0.x * s2.y) + d2.y * (s0.x * s1.y - s1.x * s0.y)) /
      denom,
  );
  ctx.drawImage(image, 0, 0);
  ctx.restore();
}

function normToPixel(p: NormPoint, w: number, h: number): Point {
  return { x: p.x * w, y: p.y * h };
}
