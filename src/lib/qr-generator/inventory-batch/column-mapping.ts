import { fuzzyColumnMatch } from "@/lib/code-scanner/parse-content";
import type { BatchColumn, FieldColumnMapping } from "./types";
import { INV_NUMBER_COLUMN_NAME } from "./types";

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

function columnMatches(columnName: string, keys: string[]): boolean {
  const n = normalizeHeader(columnName);
  return keys.some((k) => n.includes(k));
}

export function autoDetectFieldMapping(columns: BatchColumn[]): FieldColumnMapping {
  let inventoryNumber: string | null = null;
  let itemName: string | null = null;
  let department: string | null = null;
  let responsible: string | null = null;
  let serialNumber: string | null = null;

  for (const col of columns) {
    const n = normalizeHeader(col.name);
    if (!inventoryNumber && columnMatches(col.name, ["инв", "инвентар", "учет", "учёт", "asset", "inventory"])) {
      inventoryNumber = col.id;
    }
    if (!itemName && columnMatches(col.name, ["наимен", "name", "номенклат", "описан", "товар"])) {
      itemName = col.id;
    }
    if (!department && columnMatches(col.name, ["подраздел", "department", "отдел", "служб", "цех"])) {
      department = col.id;
    }
    if (!responsible && columnMatches(col.name, ["мол", "ответствен", "материально", "сотрудник", "responsible"])) {
      responsible = col.id;
    }
    if (!serialNumber && columnMatches(col.name, ["серийн", "serial", "заводск"])) {
      serialNumber = col.id;
    }
  }

  return { inventoryNumber, itemName, department, responsible, serialNumber };
}

export function suggestIdColumn(
  columns: BatchColumn[],
  preferredInvColId: string | null = null,
): string | null {
  if (preferredInvColId && columns.some((c) => c.id === preferredInvColId)) {
    return preferredInvColId;
  }
  const match = columns.find((c) => fuzzyColumnMatch(c.name));
  return match?.id ?? columns[0]?.id ?? null;
}

export function hasInvNumberColumn(columns: BatchColumn[], mapping: FieldColumnMapping): boolean {
  if (mapping.inventoryNumber && columns.some((c) => c.id === mapping.inventoryNumber)) {
    return true;
  }
  return columns.some((c) => columnMatches(c.name, ["инв", "инвентар", "учет", "учёт"]));
}

export function getRowField(
  row: { values: Record<string, string> },
  columnId: string | null | undefined,
): string {
  if (!columnId) return "";
  return row.values[columnId]?.trim() ?? "";
}

export function getRowIdentifier(
  row: { values: Record<string, string> },
  idColumnId: string | null,
): string {
  if (!idColumnId) return "";
  return row.values[idColumnId]?.trim() ?? "";
}

export function getRowTitle(
  row: { values: Record<string, string> },
  mapping: FieldColumnMapping,
  idColumnId: string | null,
): string {
  const name = getRowField(row, mapping.itemName);
  if (name) return name;
  return getRowIdentifier(row, idColumnId);
}

export function invNumberColumnLabel(): string {
  return INV_NUMBER_COLUMN_NAME;
}
