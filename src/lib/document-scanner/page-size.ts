import type { PageOrientation } from "./types";
import { A4_HEIGHT_PT, A4_HEIGHT_PX, A4_WIDTH_PT, A4_WIDTH_PX } from "./constants";

export function resolveOrientation(page: { orientation?: PageOrientation }): PageOrientation {
  return page.orientation ?? "portrait";
}

export function getPageSizePx(orientation: PageOrientation = "portrait") {
  return orientation === "landscape"
    ? { width: A4_HEIGHT_PX, height: A4_WIDTH_PX }
    : { width: A4_WIDTH_PX, height: A4_HEIGHT_PX };
}

export function getPageSizePt(orientation: PageOrientation = "portrait") {
  return orientation === "landscape"
    ? { width: A4_HEIGHT_PT, height: A4_WIDTH_PT }
    : { width: A4_WIDTH_PT, height: A4_HEIGHT_PT };
}

export function getPreviewCanvasSize(maxWidth = 400, orientation: PageOrientation = "portrait") {
  const { width, height } = getPageSizePx(orientation);
  return {
    width: maxWidth,
    height: Math.round(maxWidth * (height / width)),
  };
}

export function getPageAspectClass(orientation: PageOrientation = "portrait") {
  return orientation === "landscape" ? "aspect-[297/210]" : "aspect-[210/297]";
}

export function getPageSizeMm(orientation: PageOrientation = "portrait") {
  return orientation === "landscape"
    ? { width: "297mm", height: "210mm" }
    : { width: "210mm", height: "297mm" };
}
