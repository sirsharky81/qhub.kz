import { normalizeIdentifier } from "@/lib/code-scanner/parse-content";
import type { BatchQualityReport, BatchRow } from "./types";
import { getRowField, getRowIdentifier } from "./column-mapping";

export function analyzeBatchQuality(
  rows: BatchRow[],
  idColumnId: string | null,
  nameColumnId: string | null,
): BatchQualityReport {
  const duplicateMap = new Map<string, number>();
  let emptyIdentifiers = 0;
  let emptyNameFields = 0;

  for (const row of rows) {
    const id = getRowIdentifier(row, idColumnId);
    if (!id) emptyIdentifiers++;
    else {
      const norm = normalizeIdentifier(id);
      duplicateMap.set(norm, (duplicateMap.get(norm) ?? 0) + 1);
    }
    if (nameColumnId && !getRowField(row, nameColumnId)) {
      emptyNameFields++;
    }
  }

  const duplicateIdentifiers = [...duplicateMap.entries()]
    .filter(([, count]) => count > 1)
    .map(([id]) => id);

  return {
    totalRows: rows.length,
    emptyIdentifiers,
    duplicateIdentifiers,
    emptyNameFields,
  };
}

export function collectAllCellValues(rows: BatchRow[]): string[] {
  const values: string[] = [];
  for (const row of rows) {
    for (const v of Object.values(row.values)) {
      const t = v.trim();
      if (t) values.push(t);
    }
  }
  return values;
}
