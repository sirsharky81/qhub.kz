import * as XLSX from "xlsx";
import type { ParticipantTable } from "./types";
import { createEmptyTable } from "./data-table";

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

function parseCsvText(text: string): ParticipantTable {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return createEmptyTable();

  const delim = detectDelimiter(lines[0]!);
  const split = (line: string) => line.split(delim).map((c) => c.trim().replace(/^"|"$/g, ""));

  const header = split(lines[0]!);
  const columns = header.map((name, i) => ({
    id: crypto.randomUUID(),
    name: name || `Столбец ${i + 1}`,
  }));
  const rows = lines.slice(1).map((line) => {
    const cells = split(line);
    return columns.map((_, i) => cells[i] ?? "");
  });

  return {
    columns,
    rows: rows.length ? rows : [columns.map(() => "")],
    keyColumnId: columns[0]!.id,
  };
}

export async function importTableFromFile(file: File): Promise<ParticipantTable> {
  const ext = file.name.split(".").pop()?.toLowerCase();

  if (ext === "csv" || ext === "txt") {
    const text = await file.text();
    return parseCsvText(text);
  }

  if (ext === "xlsx" || ext === "xls") {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]!];
    if (!sheet) return createEmptyTable();
    const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "" });
    if (!data.length) return createEmptyTable();

    const header = (data[0] ?? []).map((h, i) => String(h).trim() || `Столбец ${i + 1}`);
    const columns = header.map((name) => ({ id: crypto.randomUUID(), name }));
    const rows = data.slice(1).map((row) =>
      columns.map((_, i) => String(row[i] ?? "").trim()),
    );

    return {
      columns,
      rows: rows.length ? rows : [columns.map(() => "")],
      keyColumnId: columns[0]!.id,
    };
  }

  throw new Error("Поддерживаются файлы CSV, TXT, XLS, XLSX");
}

export { parseCsvText };
