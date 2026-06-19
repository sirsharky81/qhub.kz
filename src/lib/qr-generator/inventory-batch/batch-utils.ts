import type { BatchRow, InventoryLabelBatch, LabelFilter } from "./types";
import { getRowField, getRowIdentifier, getRowTitle } from "./column-mapping";

export function filterBatchRows(
  batch: InventoryLabelBatch,
  filter: LabelFilter,
  search: string,
): BatchRow[] {
  let list = batch.rows;
  if (filter === "generated") list = list.filter((r) => r.labelGenerated);
  if (filter === "not_generated") list = list.filter((r) => !r.labelGenerated);

  const q = search.trim().toLowerCase();
  if (!q) return list;

  return list.filter((row) =>
    batch.columns.some((c) => (row.values[c.id] ?? "").toLowerCase().includes(q)),
  );
}

export function rowToLabelData(batch: InventoryLabelBatch, row: BatchRow) {
  return {
    identifier: getRowIdentifier(row, batch.idColumnId),
    title: getRowTitle(row, batch.fieldMapping, batch.idColumnId),
    inventoryNumber: getRowField(row, batch.fieldMapping.inventoryNumber ?? batch.idColumnId),
    itemName: getRowField(row, batch.fieldMapping.itemName),
    department: getRowField(row, batch.fieldMapping.department),
    responsible: getRowField(row, batch.fieldMapping.responsible),
    serialNumber: getRowField(row, batch.fieldMapping.serialNumber),
  };
}

export function markRowsGenerated(batch: InventoryLabelBatch, rowIds: string[]): InventoryLabelBatch {
  const idSet = new Set(rowIds);
  const now = Date.now();
  return {
    ...batch,
    updatedAt: now,
    rows: batch.rows.map((row) =>
      idSet.has(row.id)
        ? { ...row, labelGenerated: true, labelGeneratedAt: now }
        : row,
    ),
  };
}

export function isAsciiBarcodeSafe(value: string): boolean {
  return /^[\x20-\x7E]+$/.test(value.trim());
}

export function slugBatchFilename(name: string): string {
  return name
    .trim()
    .replace(/[^\w\u0400-\u04FF\-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60) || "baza-os";
}
