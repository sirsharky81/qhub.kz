import type { ThemeId } from "./types";

export interface PickerTheme {
  id: ThemeId;
  name: string;
  gradientFrom: string;
  gradientTo: string;
  accent: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  cardBg: string;
  cardBorder: string;
  buttonBg: string;
  buttonText: string;
}

export const THEMES: Record<ThemeId, PickerTheme> = {
  default: {
    id: "default",
    name: "Классика",
    gradientFrom: "#f8fafc",
    gradientTo: "#e2e8f0",
    accent: "#2563eb",
    textPrimary: "#0f172a",
    textSecondary: "#475569",
    textMuted: "#94a3b8",
    cardBg: "#ffffff",
    cardBorder: "#e2e8f0",
    buttonBg: "#0f172a",
    buttonText: "#ffffff",
  },
  midnight: {
    id: "midnight",
    name: "Полночь",
    gradientFrom: "#0f172a",
    gradientTo: "#1e1b4b",
    accent: "#818cf8",
    textPrimary: "#f1f5f9",
    textSecondary: "#cbd5e1",
    textMuted: "#64748b",
    cardBg: "#1e293b",
    cardBorder: "#334155",
    buttonBg: "#6366f1",
    buttonText: "#ffffff",
  },
  ocean: {
    id: "ocean",
    name: "Океан",
    gradientFrom: "#ecfeff",
    gradientTo: "#cffafe",
    accent: "#0891b2",
    textPrimary: "#164e63",
    textSecondary: "#155e75",
    textMuted: "#67e8f9",
    cardBg: "#ffffff",
    cardBorder: "#a5f3fc",
    buttonBg: "#0891b2",
    buttonText: "#ffffff",
  },
  sunset: {
    id: "sunset",
    name: "Закат",
    gradientFrom: "#fff7ed",
    gradientTo: "#ffedd5",
    accent: "#ea580c",
    textPrimary: "#431407",
    textSecondary: "#9a3412",
    textMuted: "#fdba74",
    cardBg: "#ffffff",
    cardBorder: "#fed7aa",
    buttonBg: "#ea580c",
    buttonText: "#ffffff",
  },
  forest: {
    id: "forest",
    name: "Лес",
    gradientFrom: "#ecfdf5",
    gradientTo: "#d1fae5",
    accent: "#059669",
    textPrimary: "#064e3b",
    textSecondary: "#047857",
    textMuted: "#6ee7b7",
    cardBg: "#ffffff",
    cardBorder: "#a7f3d0",
    buttonBg: "#059669",
    buttonText: "#ffffff",
  },
};

export function getTheme(id: ThemeId): PickerTheme {
  return THEMES[id] ?? THEMES.default;
}

export const THEME_STORAGE_KEY = "qhub-random-picker-theme";
