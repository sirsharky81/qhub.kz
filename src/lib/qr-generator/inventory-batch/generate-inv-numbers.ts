import { normalizeIdentifier } from "@/lib/code-scanner/parse-content";
import type { BatchColumn, BatchRow, InvNumberPattern } from "./types";
import { INV_NUMBER_COLUMN_NAME } from "./types";
import { collectAllCellValues } from "./quality";

const PREFIX_NUM_RE = /^([A-Za-zА-Яа-яЁё]{1,5}[\s\-_]?)(\d+)$/;
const DIGITS_ONLY_RE = /^(\d{6,14})$/;

export function detectInvNumberPattern(values: string[]): InvNumberPattern {
  let prefix = "";
  let width = 11;
  let separator = "";

  for (const raw of values) {
    const v = raw.trim();
    if (!v) continue;

    const prefixMatch = v.match(PREFIX_NUM_RE);
    if (prefixMatch) {
      prefix = prefixMatch[1]!.replace(/[\s_]+$/, "");
      separator = prefixMatch[1]!.includes("-") ? "-" : "";
      width = Math.max(width, prefixMatch[2]!.length);
      continue;
    }

    const digitsMatch = v.match(DIGITS_ONLY_RE);
    if (digitsMatch) {
      width = Math.max(width, digitsMatch[1]!.length);
    }
  }

  return { prefix, width, separator };
}

function formatInvNumber(n: number, pattern: InvNumberPattern): string {
  const num = String(n).padStart(pattern.width, "0");
  if (pattern.prefix) {
    return `${pattern.prefix}${pattern.separator}${num}`;
  }
  return num;
}

function buildUsedSet(rows: BatchRow[]): Set<string> {
  const used = new Set<string>();
  for (const row of rows) {
    for (const v of Object.values(row.values)) {
      const t = v.trim();
      if (t) used.add(normalizeIdentifier(t));
    }
  }
  return used;
}

export function previewInvNumbers(count: number, pattern: InvNumberPattern, start = 1): string[] {
  const preview: string[] = [];
  for (let i = start; i < start + count; i++) {
    preview.push(formatInvNumber(i, pattern));
  }
  return preview;
}

export function assignInvNumbersToBatch(
  rows: BatchRow[],
  columns: BatchColumn[],
  invColumnId: string,
  pattern?: InvNumberPattern,
): { rows: BatchRow[]; columns: BatchColumn[]; pattern: InvNumberPattern } {
  const detected = pattern ?? detectInvNumberPattern(collectAllCellValues(rows));
  const used = buildUsedSet(rows);
  let counter = 1;

  const nextUnique = (): string => {
    for (let guard = 0; guard < 1_000_000; guard++) {
      const candidate = formatInvNumber(counter, detected);
      counter++;
      if (!used.has(normalizeIdentifier(candidate))) {
        used.add(normalizeIdentifier(candidate));
        return candidate;
      }
    }
    throw new Error("cannot_allocate_inv_number");
  };

  const updatedRows = rows.map((row) => {
    const existing = row.values[invColumnId]?.trim();
    if (existing) return row;
    return {
      ...row,
      values: { ...row.values, [invColumnId]: nextUnique() },
    };
  });

  return { rows: updatedRows, columns, pattern: detected };
}

export function addInvNumberColumn(columns: BatchColumn[]): {
  columns: BatchColumn[];
  invColumnId: string;
} {
  const existing = columns.find((c) =>
    c.name.toLowerCase().includes("инв") || c.name.toLowerCase().includes("учет") || c.name.toLowerCase().includes("учёт"),
  );
  if (existing) return { columns, invColumnId: existing.id };

  const invColumnId = crypto.randomUUID();
  return {
    columns: [...columns, { id: invColumnId, name: INV_NUMBER_COLUMN_NAME }],
    invColumnId,
  };
}
