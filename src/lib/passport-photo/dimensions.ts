const DPI = 300;
const CM_PER_INCH = 2.54;

export function cmToPx(cm: number): number {
  return Math.round((cm / CM_PER_INCH) * DPI);
}

export interface PhotoSize {
  id: string;
  label: string;
  widthCm: number;
  heightCm: number;
  widthPx: number;
  heightPx: number;
}

export interface PaperSize {
  id: string;
  label: string;
  widthCm: number;
  heightCm: number;
  widthPx: number;
  heightPx: number;
}

export const PHOTO_SIZES: PhotoSize[] = [
  { id: "3x4", label: "3×4 cm (фото на документы)", widthCm: 3, heightCm: 4, widthPx: cmToPx(3), heightPx: cmToPx(4) },
  { id: "3.5x4.5", label: "3.5×4.5 cm (паспорт РК)", widthCm: 3.5, heightCm: 4.5, widthPx: cmToPx(3.5), heightPx: cmToPx(4.5) },
  { id: "4x5", label: "4×5 cm (универсальный)", widthCm: 4, heightCm: 5, widthPx: cmToPx(4), heightPx: cmToPx(5) },
  { id: "3.5x3.5", label: "3.5×3.5 cm (квадрат, визы)", widthCm: 3.5, heightCm: 3.5, widthPx: cmToPx(3.5), heightPx: cmToPx(3.5) },
  { id: "5x5", label: "5×5 cm (США / Канада)", widthCm: 5, heightCm: 5, widthPx: cmToPx(5), heightPx: cmToPx(5) },
];

export const PAPER_SIZES: PaperSize[] = [
  { id: "10x15", label: "10×15 cm (стандарт)", widthCm: 10, heightCm: 15, widthPx: cmToPx(10), heightPx: cmToPx(15) },
  { id: "13x18", label: "13×18 cm (фотолаб)", widthCm: 13, heightCm: 18, widthPx: cmToPx(13), heightPx: cmToPx(18) },
  { id: "15x21", label: "15×21 cm (A5)", widthCm: 15, heightCm: 21, widthPx: cmToPx(15), heightPx: cmToPx(21) },
  { id: "10x10", label: "10×10 cm (квадрат)", widthCm: 10, heightCm: 10, widthPx: cmToPx(10), heightPx: cmToPx(10) },
  { id: "20x30", label: "20×30 cm (большой)", widthCm: 20, heightCm: 30, widthPx: cmToPx(20), heightPx: cmToPx(30) },
];

export const MARGIN_CM = 0.3;
export const MARGIN_PX = cmToPx(MARGIN_CM);

export type PhotoCount = 1 | 4 | 6;

export interface LayoutResult {
  columns: number;
  rows: number;
  count: number;
}

export function calculateLayout(photo: PhotoSize, paper: PaperSize): LayoutResult {
  const usableW = paper.widthCm - 2 * MARGIN_CM;
  const usableH = paper.heightCm - 2 * MARGIN_CM;
  const slotW = photo.widthCm + MARGIN_CM;
  const slotH = photo.heightCm + MARGIN_CM;
  const columns = Math.max(1, Math.floor(usableW / slotW));
  const rows = Math.max(1, Math.floor(usableH / slotH));
  return { columns, rows, count: columns * rows };
}

export const BACKGROUND_COLORS = {
  white: { value: "#FFFFFF", label: "Белый" },
  lightBlue: { value: "#C8DCF0", label: "Светло-голубой" },
} as const;

export type BackgroundColor = keyof typeof BACKGROUND_COLORS;
