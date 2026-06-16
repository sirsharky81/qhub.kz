import type { NormPoint } from "./types";
import { isOpenCVReady } from "./opencv-loader";
import { perfMark, perfMeasure } from "./scanner-perf";

export async function warpPerspectiveOpenCV(
  source: HTMLCanvasElement,
  corners: NormPoint[],
  outWidth: number,
  outHeight: number,
): Promise<HTMLCanvasElement | null> {
  if (!isOpenCVReady()) return null;

  perfMark("warp-opencv:start");
  try {
    const cv = window.cv!;
    const sw = source.width;
    const sh = source.height;
    const srcPts = corners.map((c) => ({ x: c.x * sw, y: c.y * sh }));

    const src = cv.imread(source);
    const dst = new cv.Mat();
    const dsize = new cv.Size(outWidth, outHeight);

    const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
      srcPts[0]!.x, srcPts[0]!.y,
      srcPts[1]!.x, srcPts[1]!.y,
      srcPts[2]!.x, srcPts[2]!.y,
      srcPts[3]!.x, srcPts[3]!.y,
    ]);
    const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
      0, 0,
      outWidth, 0,
      outWidth, outHeight,
      0, outHeight,
    ]);

    const M = cv.getPerspectiveTransform(srcTri, dstTri);
    cv.warpPerspective(
      src,
      dst,
      M,
      dsize,
      cv.INTER_CUBIC,
      cv.BORDER_CONSTANT,
      [255, 255, 255, 255],
    );

    const out = document.createElement("canvas");
    out.width = outWidth;
    out.height = outHeight;
    cv.imshow(out, dst);

    src.delete();
    dst.delete();
    srcTri.delete();
    dstTri.delete();
    M.delete();

    perfMeasure("warp-opencv", "warp-opencv:start");
    return out;
  } catch {
    return null;
  }
}
