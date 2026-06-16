import { MAX_PARTICIPANTS } from "./participants";
import type { ColumnDef, ParticipantTable, PickNumbering, ResultTable } from "./types";
import { DEFAULT_COLUMNS } from "./types";

export function createEmptyTable(): ParticipantTable {
  const columns: ColumnDef[] = DEFAULT_COLUMNS.map((c) => ({
    id: crypto.randomUUID(),
    name: c.name,
  }));
  return {
    columns,
    rows: Array.from({ length: 3 }, () => columns.map(() => "")),
    keyColumnId: columns[0]!.id,
  };
}

export function getKeyColumnIndex(table: ParticipantTable): number {
  const idx = table.columns.findIndex((c) => c.id === table.keyColumnId);
  return idx >= 0 ? idx : 0;
}

export function getKeyColumn(table: ParticipantTable): ColumnDef | undefined {
  return table.columns.find((c) => c.id === table.keyColumnId) ?? table.columns[0];
}

export function extractParticipants(table: ParticipantTable): string[] {
  const colIdx = getKeyColumnIndex(table);
  const values = table.rows
    .map((row) => (row[colIdx] ?? "").trim())
    .filter(Boolean);
  return values.slice(0, MAX_PARTICIPANTS);
}

export function extractRowKeys(table: ParticipantTable): number[] {
  const colIdx = getKeyColumnIndex(table);
  return table.rows
    .map((row, i) => ((row[colIdx] ?? "").trim() ? i : -1))
    .filter((i) => i >= 0);
}

export function tableRowCount(table: ParticipantTable): number {
  return extractRowKeys(table).length;
}

export function hasTableData(table: ParticipantTable): boolean {
  if (tableRowCount(table) > 0) return true;
  return table.rows.some((row) => row.some((cell) => cell.trim().length > 0));
}

export function addColumn(table: ParticipantTable): ParticipantTable {
  const id = crypto.randomUUID();
  return {
    ...table,
    columns: [...table.columns, { id, name: `Поле ${table.columns.length + 1}` }],
    rows: table.rows.map((row) => [...row, ""]),
  };
}

export function removeColumn(table: ParticipantTable, columnId: string): ParticipantTable {
  if (table.columns.length <= 1) return table;
  const idx = table.columns.findIndex((c) => c.id === columnId);
  if (idx < 0) return table;
  const columns = table.columns.filter((c) => c.id !== columnId);
  let keyColumnId = table.keyColumnId;
  if (keyColumnId === columnId) keyColumnId = columns[0]!.id;
  return {
    columns,
    keyColumnId,
    rows: table.rows.map((row) => row.filter((_, i) => i !== idx)),
  };
}

export function addRow(table: ParticipantTable): ParticipantTable {
  return {
    ...table,
    rows: [...table.rows, table.columns.map(() => "")],
  };
}

export function removeRow(table: ParticipantTable, rowIndex: number): ParticipantTable {
  if (table.rows.length <= 1) return table;
  return {
    ...table,
    rows: table.rows.filter((_, i) => i !== rowIndex),
  };
}

export function updateCell(
  table: ParticipantTable,
  rowIndex: number,
  colIndex: number,
  value: string,
): ParticipantTable {
  const rows = table.rows.map((row, ri) =>
    ri === rowIndex ? row.map((cell, ci) => (ci === colIndex ? value : cell)) : row,
  );
  return { ...table, rows };
}

export function updateColumnName(
  table: ParticipantTable,
  columnId: string,
  name: string,
): ParticipantTable {
  return {
    ...table,
    columns: table.columns.map((c) => (c.id === columnId ? { ...c, name } : c)),
  };
}

export function setKeyColumn(table: ParticipantTable, columnId: string): ParticipantTable {
  return { ...table, keyColumnId: columnId };
}

export function serializeTable(table: ParticipantTable): string {
  return JSON.stringify(table);
}

export function deserializeTable(raw: string): ParticipantTable {
  try {
    const parsed = JSON.parse(raw) as ParticipantTable;
    if (parsed?.columns?.length && parsed?.rows) {
      return {
        columns: parsed.columns,
        rows: parsed.rows,
        keyColumnId: parsed.keyColumnId || parsed.columns[0]!.id,
      };
    }
  } catch {
    /* fallback */
  }
  return createEmptyTable();
}

export function buildResultTable(
  table: ParticipantTable,
  rowIndices: number[],
  options?: { placeNumbers?: number[] },
): ResultTable {
  const placeNumbers = options?.placeNumbers;
  const showPlace =
    placeNumbers !== undefined && placeNumbers.length === rowIndices.length;

  const headers = showPlace
    ? ["№", ...table.columns.map((c) => c.name)]
    : table.columns.map((c) => c.name);

  const rows = rowIndices.map((ri, i) => {
    const row = table.rows[ri] ?? [];
    const values = table.columns.map((_, ci) => row[ci]?.trim() ?? "");
    return showPlace ? [String(placeNumbers![i]!), ...values] : values;
  });

  return { headers, rows };
}

export function formatRowValues(table: ParticipantTable, rowIndex: number): string {
  const row = table.rows[rowIndex];
  if (!row) return "";
  return row.map((cell) => cell?.trim() ?? "").filter(Boolean).join(", ");
}

export function pickPlaceNumber(
  pickIndex: number,
  total: number,
  numbering: PickNumbering,
): number {
  return numbering === "asc" ? pickIndex + 1 : total - pickIndex;
}

export function formatPickLine(
  table: ParticipantTable,
  rowIndex: number,
  pickIndex: number,
  total: number,
  numbering: PickNumbering,
): string {
  const values = formatRowValues(table, rowIndex);
  if (!values) return "";
  return `${pickPlaceNumber(pickIndex, total, numbering)}. ${values}`;
}

export function formatPickResult(
  table: ParticipantTable,
  rowIndices: number[],
  options: { total: number; numbering: PickNumbering },
): string {
  const { total, numbering } = options;
  return rowIndices
    .map((ri, i) => {
      const values = formatRowValues(table, ri);
      if (!values) return "";
      return `${pickPlaceNumber(i, total, numbering)}. ${values}`;
    })
    .filter(Boolean)
    .join("\n");
}

export function formatResultWithContext(
  table: ParticipantTable,
  rowIndices: number[],
): string {
  return rowIndices
    .map((ri) => formatRowValues(table, ri))
    .filter(Boolean)
    .join("\n");
}

export function pickRowIndices(
  table: ParticipantTable,
  count: number,
  excludeIndices: readonly number[] = [],
): number[] {
  const available = extractRowKeys(table).filter((i) => !excludeIndices.includes(i));
  if (count > available.length) throw new Error("Not enough rows");
  const shuffled = [...available];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const j = buf[0]! % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  return shuffled.slice(0, count);
}
