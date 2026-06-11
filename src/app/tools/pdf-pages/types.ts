export type PageRotation = 0 | 90 | 180 | 270;

export interface PdfPage {
  id: string;
  pageIndex: number;
  rotation: PageRotation;
  thumbnail: string | null;
  selected: boolean;
  sourceFile: string;
  /** Page width in PDF points */
  width: number;
  /** Page height in PDF points */
  height: number;
}

export interface AppState {
  pages: PdfPage[];
  originalBytes: Uint8Array | null;
  isLoading: boolean;
  isProcessing: boolean;
  error: string | null;
}

export type PdfActionMode = "split" | "extract" | null;

export type SplitMode = "each" | "ranges";
