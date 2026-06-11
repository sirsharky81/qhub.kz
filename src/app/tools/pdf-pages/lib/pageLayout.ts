import type { PageRotation, PdfPage } from "../types";

/** Default A4 portrait size in PDF points. */
export const DEFAULT_PAGE_WIDTH = 595;
export const DEFAULT_PAGE_HEIGHT = 842;

/**
 * Returns CSS aspect-ratio value accounting for user rotation.
 */
export function getPageAspectRatio(page: PdfPage): number {
  let w = page.width || DEFAULT_PAGE_WIDTH;
  let h = page.height || DEFAULT_PAGE_HEIGHT;

  if (page.rotation === 90 || page.rotation === 270) {
    [w, h] = [h, w];
  }

  return w / h;
}

/**
 * Whether the page displays as landscape after rotation.
 */
export function isPageLandscape(page: PdfPage): boolean {
  return getPageAspectRatio(page) > 1;
}

/**
 * Max height class for thumbnails — landscape pages get less vertical space.
 */
export function getPageMaxHeightClass(page: PdfPage): string {
  return isPageLandscape(page) ? "max-h-32 sm:max-h-28" : "max-h-44 sm:max-h-40";
}

/**
 * Rotation in degrees for pdf.js viewport rendering.
 */
export function getViewportRotation(rotation: PageRotation): number {
  return rotation;
}
