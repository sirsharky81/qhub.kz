import type {
  InventoryFormData,
  StorageFormData,
  StorageItemRow,
  StorageLocationType,
} from "./types";

const LOCATION_LABELS: Record<StorageLocationType, string> = {
  cabinet: "Шкаф",
  rack: "Стеллаж",
  garage: "Гараж",
  warehouse: "Склад",
  room: "Комната",
  shelf: "Полка",
  other: "Другое",
};

export function locationTypeLabel(type: StorageLocationType | ""): string {
  if (!type) return "";
  return LOCATION_LABELS[type];
}

export function buildStoragePayload(data: StorageFormData): string {
  const lines: string[] = ["Тип: Коробка"];
  if (data.name.trim()) lines.push(`Название: ${data.name.trim()}`);
  if (data.boxNumber.trim()) lines.push(`Номер: ${data.boxNumber.trim()}`);

  const locParts: string[] = [];
  if (data.locationType) {
    locParts.push(locationTypeLabel(data.locationType));
  }
  if (data.locationNumber.trim()) locParts.push(data.locationNumber.trim());
  if (data.locationSection.trim()) locParts.push(data.locationSection.trim());

  if (locParts.length) {
    lines.push("Расположение:");
    lines.push(...locParts);
  }

  const validItems = data.items.filter((i) => i.name.trim());
  if (validItems.length) {
    lines.push("Содержимое:");
    validItems.forEach((item, idx) => {
      const qty = Math.max(1, item.quantity);
      let row = `${idx + 1}. ${item.name.trim()} x${qty}`;
      if (item.comment.trim()) row += ` (${item.comment.trim()})`;
      lines.push(row);
    });
  }

  if (data.comment.trim()) {
    lines.push("Комментарий:");
    lines.push(data.comment.trim());
  }

  return lines.join("\n");
}

export function buildInventoryPayload(data: InventoryFormData): string {
  const lines: string[] = ["Тип: Инвентарная метка"];
  if (data.inventoryNumber.trim()) lines.push(`Инв.номер: ${data.inventoryNumber.trim()}`);
  if (data.code.trim()) lines.push(`Код: ${data.code.trim()}`);
  if (data.itemName.trim()) lines.push(`Наименование: ${data.itemName.trim()}`);
  if (data.category.trim()) lines.push(`Категория: ${data.category.trim()}`);
  if (data.department.trim()) lines.push(`Подразделение: ${data.department.trim()}`);
  if (data.responsible.trim()) lines.push(`МОЛ: ${data.responsible.trim()}`);
  if (data.entryDate.trim()) lines.push(`Дата ввода: ${data.entryDate.trim()}`);
  if (data.initialCost.trim()) lines.push(`Первоначальная стоимость: ${data.initialCost.trim()}`);
  if (data.condition.trim()) lines.push(`Состояние: ${data.condition.trim()}`);
  return lines.join("\n");
}

export function getStorageIdentifier(data: StorageFormData): string {
  return data.boxNumber.trim() || data.name.trim();
}

export function getInventoryIdentifier(data: InventoryFormData): string {
  return data.inventoryNumber.trim();
}

export function getStorageDisplayTitle(data: StorageFormData): string {
  return data.name.trim();
}

export function getInventoryDisplayTitle(data: InventoryFormData): string {
  return data.itemName.trim() || data.inventoryNumber.trim();
}

export function newStorageItem(): StorageItemRow {
  return { id: crypto.randomUUID(), name: "", quantity: 1, comment: "" };
}

export function clampStorageField(value: string, max: number): string {
  return value.slice(0, max);
}

export function validateStorageItemName(name: string): boolean {
  const t = name.trim();
  return t.length >= 1 && t.length <= 60;
}
