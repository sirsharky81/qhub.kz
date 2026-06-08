export type PhotoFormatId = "3x4" | "3.5x4.5" | "4x5" | "3.5x3.5" | "5x5";

export interface FormatRule {
  ratio: number;
  headHeightMin: number;
  headHeightMax: number;
}

/** Пропорции лица в кадре по формату паспортного фото */
export const formatRules: Record<PhotoFormatId, FormatRule> = {
  "3x4": { ratio: 3 / 4, headHeightMin: 0.68, headHeightMax: 0.8 },
  "3.5x4.5": { ratio: 3.5 / 4.5, headHeightMin: 0.7, headHeightMax: 0.8 },
  "4x5": { ratio: 4 / 5, headHeightMin: 0.68, headHeightMax: 0.8 },
  "3.5x3.5": { ratio: 1, headHeightMin: 0.65, headHeightMax: 0.78 },
  "5x5": { ratio: 1, headHeightMin: 0.7, headHeightMax: 0.8 },
};

export function getFormatRule(formatId: string): FormatRule {
  return formatRules[formatId as PhotoFormatId] ?? formatRules["3.5x4.5"];
}
