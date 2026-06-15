export interface Point {
  x: number;
  y: number;
}

/** Normalized coordinates 0–1 relative to image dimensions */
export type NormPoint = Point;

export type FilterMode = "color" | "bw" | "grayscale" | "enhanced";

export type A4FitMode = "fit" | "natural";

export type PageOrientation = "portrait" | "landscape";

export type ExportFormat = "pdf" | "jpg" | "png" | "webp";

export type ExportQuality = "high" | "medium" | "low";

export interface PageAdjustments {
  brightness: number;
  contrast: number;
}

export const DEFAULT_ADJUSTMENTS: PageAdjustments = { brightness: 0, contrast: 0 };

export interface ScanItem {
  id: string;
  /** Cropped source image */
  imageBlob: Blob;
  /** Center position in available area (0–1) */
  x: number;
  y: number;
  /** Width as fraction of available area (0–1) */
  widthFrac: number;
  rotation: number;
  /** @deprecated legacy — use widthFrac */
  scale?: number;
}

export interface ScanPage {
  id: string;
  name: string;
  filter: FilterMode;
  adjustments: PageAdjustments;
  items: ScanItem[];
  a4FitMode: A4FitMode;
  /** Default: portrait (книжная) */
  orientation?: PageOrientation;
}

export interface ScanDocument {
  id: string;
  name: string;
  pages: ScanPage[];
  createdAt: number;
  updatedAt: number;
}

export type ScannerStep =
  | "home"
  | "crop"
  | "edit"
  | "compose"
  | "pages"
  | "export";

export type AddPageSource = "camera" | "gallery" | "file";

export interface CropState {
  sourceFile: File;
  sourceCanvas: HTMLCanvasElement;
  rotation: number;
  corners: NormPoint[];
}

export interface ExportSettings {
  filename: string;
  formats: ExportFormat[];
  quality: ExportQuality;
}
