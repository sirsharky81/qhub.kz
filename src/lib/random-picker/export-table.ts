import * as XLSX from "xlsx";
import { saveBlobToDevice } from "@/lib/platform/save-file";
import type { ParticipantTable } from "./types";

function escapeCsvCell(value: string, delimiter: string): string {
  if (value.includes(delimiter) || value.includes('"') || value.includes("\n") || value.includes("\r")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function tableToRows(table: ParticipantTable): string[][] {
  return [
    table.columns.map((c) => c.name),
    ...table.rows.map((row) => table.columns.map((_, i) => row[i]?.trim() ?? "")),
  ];
}

export function tableToCsv(table: ParticipantTable, delimiter = ";"): string {
  return tableToRows(table)
    .map((row) => row.map((cell) => escapeCsvCell(cell, delimiter)).join(delimiter))
    .join("\r\n");
}

function defaultFilename(ext: "csv" | "xlsx", eventName?: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const slug = eventName
    ?.trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return slug ? `${slug}-${date}.${ext}` : `participants-${date}.${ext}`;
}

export async function downloadParticipantCsv(table: ParticipantTable, eventName?: string): Promise<void> {
  const csv = `\uFEFF${tableToCsv(table)}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  await saveBlobToDevice(blob, defaultFilename("csv", eventName));
}

export async function downloadParticipantXlsx(table: ParticipantTable, eventName?: string): Promise<void> {
  const ws = XLSX.utils.aoa_to_sheet(tableToRows(table));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Участники");
  const buffer = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  await saveBlobToDevice(blob, defaultFilename("xlsx", eventName));
}
