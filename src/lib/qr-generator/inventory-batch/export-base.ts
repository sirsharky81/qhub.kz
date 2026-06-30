import type { InventoryLabelBatch } from "./types";
import { GENERATED_AT_COLUMN_NAME, GENERATED_COLUMN_NAME } from "./types";
import { saveBlobToDevice } from "@/lib/platform/save-file";

export function batchToMatrix(batch: InventoryLabelBatch): string[][] {
  const headers = [
    ...batch.columns.map((c) => c.name),
    GENERATED_COLUMN_NAME,
    GENERATED_AT_COLUMN_NAME,
  ];
  const rows = batch.rows.map((row) => [
    ...batch.columns.map((c) => row.values[c.id] ?? ""),
    row.labelGenerated ? "Да" : "Нет",
    row.labelGeneratedAt
      ? new Date(row.labelGeneratedAt).toLocaleString("ru-RU")
      : "",
  ]);
  return [headers, ...rows];
}

export function matrixToCsv(matrix: string[][]): string {
  const escape = (v: string) => {
    if (/[;"\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
    return v;
  };
  return "\uFEFF" + matrix.map((row) => row.map(escape).join(";")).join("\r\n");
}

export async function downloadBatchCsv(batch: InventoryLabelBatch, filename: string): Promise<void> {
  const matrix = batchToMatrix(batch);
  const blob = new Blob([matrixToCsv(matrix)], { type: "text/csv;charset=utf-8" });
  await saveBlobToDevice(blob, filename.endsWith(".csv") ? filename : `${filename}.csv`);
}

export async function downloadBatchXlsx(batch: InventoryLabelBatch, filename: string): Promise<void> {
  const XLSX = await import("xlsx");
  const matrix = batchToMatrix(batch);
  const ws = XLSX.utils.aoa_to_sheet(matrix);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "База ОС");
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  await saveBlobToDevice(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`,
  );
}
