import * as XLSX from "xlsx";
import type { StorageItemRow } from "./types";
import { newStorageItem } from "./storageSerializers";

export interface ImportColumnMapping {
  nameCol: number;
  quantityCol: number;
  commentCol: number | null;
}

export interface ParsedImportSheet {
  headers: string[];
  rows: string[][];
}

const NAME_HEADERS = ["наименование", "name", "товар", "item", "название", "атауы"];
const QTY_HEADERS = ["кол-во", "количество", "quantity", "qty", "саны"];
const COMMENT_HEADERS = ["комментарий", "comment", "note", "примечание"];

function detectDelimiter(line: string): ";" | "," | "\t" {
  const counts = {
    ";": (line.match(/;/g) ?? []).length,
    ",": (line.match(/,/g) ?? []).length,
    "\t": (line.match(/\t/g) ?? []).length,
  };
  if (counts[";"] >= counts[","] && counts[";"] >= counts["\t"]) return ";";
  if (counts["\t"] >= counts[","]) return "\t";
  return ",";
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

export function autoDetectColumns(headers: string[]): ImportColumnMapping | null {
  let nameCol = -1;
  let quantityCol = -1;
  let commentCol: number | null = null;

  headers.forEach((h, i) => {
    const n = normalizeHeader(h);
    if (NAME_HEADERS.some((k) => n.includes(k))) nameCol = i;
    if (QTY_HEADERS.some((k) => n.includes(k))) quantityCol = i;
    if (COMMENT_HEADERS.some((k) => n.includes(k))) commentCol = i;
  });

  if (nameCol < 0) return null;
  if (quantityCol < 0) quantityCol = nameCol + 1 < headers.length ? nameCol + 1 : -1;

  return {
    nameCol,
    quantityCol: quantityCol >= 0 ? quantityCol : nameCol,
    commentCol,
  };
}

export async function parseImportFile(file: File): Promise<ParsedImportSheet> {
  const ext = file.name.split(".").pop()?.toLowerCase();

  if (ext === "csv" || ext === "txt") {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (!lines.length) return { headers: [], rows: [] };
    const delim = detectDelimiter(lines[0]!);
    const split = (line: string) =>
      line.split(delim).map((c) => c.trim().replace(/^"|"$/g, ""));
    return {
      headers: split(lines[0]!),
      rows: lines.slice(1).map(split),
    };
  }

  if (ext === "xlsx" || ext === "xls") {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]!];
    if (!sheet) return { headers: [], rows: [] };
    const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "" });
    if (!data.length) return { headers: [], rows: [] };
    const headers = (data[0] ?? []).map((h) => String(h).trim());
    const rows = data.slice(1).map((row) => headers.map((_, i) => String(row[i] ?? "").trim()));
    return { headers, rows };
  }

  throw new Error("unsupported_format");
}

export function rowsToStorageItems(
  rows: string[][],
  mapping: ImportColumnMapping,
): StorageItemRow[] {
  return rows
    .map((row) => {
      const name = (row[mapping.nameCol] ?? "").trim().slice(0, 60);
      if (!name) return null;
      const qtyRaw = parseInt(String(row[mapping.quantityCol] ?? "1"), 10);
      const quantity = Number.isFinite(qtyRaw) && qtyRaw >= 1 ? qtyRaw : 1;
      const comment =
        mapping.commentCol != null
          ? (row[mapping.commentCol] ?? "").trim().slice(0, 60)
          : "";
      return { ...newStorageItem(), name, quantity, comment };
    })
    .filter((r): r is StorageItemRow => r !== null);
}
