import type { StorageFormData } from "./types";

export interface StoragePreset {
  id: string;
  nameKey: string;
  data: Partial<StorageFormData>;
}

export const STORAGE_PRESETS: StoragePreset[] = [
  {
    id: "seasonal",
    nameKey: "preset.seasonal",
    data: {
      name: "Новогодние игрушки",
      locationType: "room",
      locationNumber: "Кладовка",
      locationSection: "Антресоль",
      comment: "",
    },
  },
  {
    id: "warehouse-cell",
    nameKey: "preset.warehouse",
    data: {
      locationType: "rack",
      locationNumber: "Стеллаж А",
      locationSection: "Полка 3, Ячейка 12",
      comment: "",
    },
  },
  {
    id: "archive",
    nameKey: "preset.archive",
    data: {
      name: "Архив-2024-15",
      locationType: "warehouse",
      comment: "Договоры поставщиков, 2024 год",
    },
  },
];

export function applyStoragePreset(
  current: StorageFormData,
  preset: StoragePreset,
): StorageFormData {
  return {
    ...current,
    ...preset.data,
    items: current.items,
    boxNumber: current.boxNumber,
  };
}
