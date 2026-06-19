import type { BatchColumn, BatchRow, BatchSource, InventoryLabelBatch } from "./types";
import { MAX_BATCH_FILE_BYTES, MAX_BATCH_ROWS } from "./types";
import { autoDetectFieldMapping, suggestIdColumn } from "./column-mapping";

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

function splitCsvLine(line: string, delim: ";" | "," | "\t"): string[] {
  return line.split(delim).map((c) => c.trim().replace(/^"|"$/g, ""));
}

export function validateBatchFile(file: File): string | null {
  if (file.size > MAX_BATCH_FILE_BYTES) {
    return "file_too_large";
  }
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (!ext || !["csv", "txt", "xlsx", "xls"].includes(ext)) {
    return "unsupported_format";
  }
  return null;
}

export async function readSpreadsheetAoA(file: File): Promise<string[][]> {
  const ext = file.name.split(".").pop()?.toLowerCase();

  if (ext === "csv" || ext === "txt") {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (!lines.length) return [];
    const delim = detectDelimiter(lines[0]!);
    return lines.map((line) => splitCsvLine(line, delim));
  }

  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]!];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "" }) as string[][];
}

export function aoaToBatch(
  aoa: string[][],
  name: string,
  source: BatchSource,
): InventoryLabelBatch {
  if (!aoa.length) {
    throw new Error("empty_file");
  }

  const header = aoa[0]!.map((h, i) => String(h ?? "").trim() || `Столбец ${i + 1}`);
  const columns: BatchColumn[] = header.map((colName) => ({
    id: crypto.randomUUID(),
    name: colName,
  }));

  const rows: BatchRow[] = aoa
    .slice(1)
    .filter((cells) => cells.some((c) => String(c ?? "").trim()))
    .slice(0, MAX_BATCH_ROWS)
    .map((cells) => {
      const values: Record<string, string> = {};
      columns.forEach((col, idx) => {
        values[col.id] = String(cells[idx] ?? "").trim();
      });
      return {
        id: crypto.randomUUID(),
        values,
        labelGenerated: false,
      };
    });

  const dataRowCount = aoa.slice(1).filter((cells) => cells.some((c) => String(c ?? "").trim())).length;
  if (dataRowCount > MAX_BATCH_ROWS) {
    throw new Error("too_many_rows");
  }

  const fieldMapping = autoDetectFieldMapping(columns);
  const idColumnId = suggestIdColumn(columns, fieldMapping.inventoryNumber);

  const now = Date.now();
  return {
    batchId: crypto.randomUUID(),
    name: name.replace(/\.[^.]+$/, "") || name,
    source,
    createdAt: now,
    updatedAt: now,
    step: "quality",
    columns,
    rows,
    idColumnId,
    fieldMapping,
    mappingConfirmed: false,
  };
}

export async function parseSpreadsheetToBatch(file: File): Promise<InventoryLabelBatch> {
  const validation = validateBatchFile(file);
  if (validation) throw new Error(validation);
  const aoa = await readSpreadsheetAoA(file);
  if (!aoa.length) throw new Error("empty_file");
  return aoaToBatch(aoa, file.name, "upload");
}
