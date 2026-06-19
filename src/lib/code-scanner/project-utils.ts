import type { BaseColumn, BaseQualityReport, BaseRow, InventoryProject, InventoryProjectSummary, LedgerRowStatus, ProjectStatus } from "./types";
import { IDENTIFIER_COLUMN_ID, IDENTIFIER_COLUMN_NAME, EXTRA_COLUMN_PREFIX } from "./types";
import { fuzzyColumnMatch, normalizeIdentifier, nowIso, parseInventoryTokens, formatScanDateTime } from "./parse-content";

export function generateDisplayNumber(existingNumbers: string[], year = new Date().getFullYear()): string {
  const prefix = `INV-${year}-`;
  const nums = existingNumbers
    .filter((n) => n.startsWith(prefix))
    .map((n) => Number(n.slice(prefix.length)))
    .filter((n) => Number.isFinite(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `${prefix}${String(next).padStart(5, "0")}`;
}

export function createEmptyProject(existingNumbers: string[]): InventoryProject {
  const now = Date.now();
  return {
    projectId: crypto.randomUUID(),
    displayNumber: generateDisplayNumber(existingNumbers),
    name: "",
    organization: "",
    orgForm: "too",
    inventorName: "",
    startDate: new Date().toISOString().slice(0, 10),
    comment: "",
    department: "",
    branch: "",
    address: "",
    defaultMol: "",
    orderNumber: "",
    commission: "",
    phone: "",
    email: "",
    plannedEndDate: "",
    photoEveryScan: false,
    scenario: null,
    status: "active",
    createdAt: now,
    updatedAt: now,
    exportedOnce: false,
    baseColumns: [],
    baseRows: [],
    baseIdColumnId: null,
    ledgerColumns: [{ id: IDENTIFIER_COLUMN_ID, name: IDENTIFIER_COLUMN_NAME }],
    ledgerRows: [],
    ledgerMatchColumnId: IDENTIFIER_COLUMN_ID,
    mappingConfirmed: false,
    duplicates: [],
    surpluses: [],
    changeLog: [],
    totalPhotoBytes: 0,
  };
}

export function projectToSummary(project: InventoryProject): InventoryProjectSummary {
  const foundCount = project.baseRows.filter((r) => r.found).length;
  return {
    projectId: project.projectId,
    displayNumber: project.displayNumber,
    name: project.name,
    createdAt: project.createdAt,
    status: project.status,
    scenario: project.scenario,
    foundCount,
    totalBaseCount: project.baseRows.length,
  };
}

export function appendChangeLog(project: InventoryProject, action: string, detail: string): InventoryProject {
  return {
    ...project,
    changeLog: [
      { id: crypto.randomUUID(), at: Date.now(), action, detail },
      ...project.changeLog.slice(0, 199),
    ],
    updatedAt: Date.now(),
  };
}

export function ensureExtraColumns(project: InventoryProject, tokenCount: number): InventoryProject {
  const extraNeeded = Math.max(0, tokenCount - (project.ledgerColumns.length - 1));
  if (extraNeeded === 0) return project;

  const columns = [...project.ledgerColumns];
  const existingExtra = columns.length - 1;
  for (let i = 0; i < extraNeeded; i++) {
    columns.push({
      id: crypto.randomUUID(),
      name: `${EXTRA_COLUMN_PREFIX} ${existingExtra + i + 1}`,
    });
  }
  return { ...project, ledgerColumns: columns };
}

export function addLedgerScan(project: InventoryProject, raw: string): InventoryProject {
  const { identifier, tokens } = parseInventoryTokens(raw);

  let updated = ensureExtraColumns(project, tokens.length);
  const values: Record<string, string> = {};
  values[IDENTIFIER_COLUMN_ID] = identifier;
  updated.ledgerColumns.slice(1).forEach((col, idx) => {
    values[col.id] = tokens[idx] ?? "";
  });

  const row = {
    id: crypto.randomUUID(),
    scannedAt: nowIso(),
    values,
    status: "scanned" as const,
    scanCount: 1,
  };

  updated = {
    ...updated,
    ledgerRows: [...updated.ledgerRows, row],
    updatedAt: Date.now(),
  };
  return appendChangeLog(updated, "scan", identifier);
}

export function renameLedgerColumn(project: InventoryProject, columnId: string, name: string): InventoryProject {
  return {
    ...project,
    ledgerColumns: project.ledgerColumns.map((c) => (c.id === columnId ? { ...c, name: name.trim() || c.name } : c)),
    updatedAt: Date.now(),
  };
}

export function deleteLedgerRow(project: InventoryProject, rowId: string): InventoryProject {
  return appendChangeLog(
    {
      ...project,
      ledgerRows: project.ledgerRows.filter((r) => r.id !== rowId),
      updatedAt: Date.now(),
    },
    "delete_row",
    rowId,
  );
}

export function suggestIdColumn(columns: BaseColumn[]): string | null {
  const match = columns.find((c) => fuzzyColumnMatch(c.name));
  return match?.id ?? columns[0]?.id ?? null;
}

export function analyzeBaseQuality(
  rows: BaseRow[],
  idColumnId: string | null,
  keyColumnIds: string[],
): BaseQualityReport {
  const ids: string[] = [];
  let emptyIdentifiers = 0;
  let emptyKeyFields = 0;

  for (const row of rows) {
    const idVal = idColumnId ? row.values[idColumnId]?.trim() : "";
    if (!idVal) emptyIdentifiers++;
    else ids.push(normalizeIdentifier(idVal));

    for (const colId of keyColumnIds) {
      if (!row.values[colId]?.trim()) emptyKeyFields++;
    }
  }

  const seen = new Map<string, number>();
  for (const id of ids) seen.set(id, (seen.get(id) ?? 0) + 1);
  const duplicateIdentifiers = [...seen.entries()].filter(([, c]) => c > 1).map(([id]) => id);

  return {
    totalRows: rows.length,
    emptyIdentifiers,
    duplicateIdentifiers,
    emptyKeyFields,
  };
}

export function previewMapping(project: InventoryProject): { matched: number; total: number } {
  if (!project.baseIdColumnId || !project.ledgerMatchColumnId) {
    return { matched: 0, total: project.ledgerRows.length };
  }
  const baseIds = new Set(
    project.baseRows
      .map((r) => normalizeIdentifier(r.values[project.baseIdColumnId!] ?? ""))
      .filter(Boolean),
  );
  let matched = 0;
  for (const row of project.ledgerRows) {
    const id = normalizeIdentifier(row.values[project.ledgerMatchColumnId] ?? "");
    if (id && baseIds.has(id)) matched++;
  }
  return { matched, total: project.ledgerRows.length };
}

export function findBaseRowByIdentifier(project: InventoryProject, identifier: string): BaseRow | null {
  if (!project.baseIdColumnId) return null;
  const norm = normalizeIdentifier(identifier);
  return (
    project.baseRows.find((r) => normalizeIdentifier(r.values[project.baseIdColumnId!] ?? "") === norm) ?? null
  );
}

export function getBaseFieldByHint(baseRow: BaseRow, columns: BaseColumn[], hints: string[]): string {
  for (const hint of hints) {
    const col = columns.find((c) => c.name.toLowerCase().includes(hint));
    if (col && baseRow.values[col.id]) return baseRow.values[col.id]!;
  }
  return "";
}

export function parseSpreadsheetToBase(aoa: string[][]): { columns: BaseColumn[]; rows: BaseRow[] } {
  if (!aoa.length) return { columns: [], rows: [] };
  const header = aoa[0]!.map((h, i) => h?.trim() || `Столбец ${i + 1}`);
  const columns: BaseColumn[] = header.map((name) => ({ id: crypto.randomUUID(), name }));
  const rows: BaseRow[] = aoa
    .slice(1)
    .filter((r) => r.some((c) => String(c ?? "").trim()))
    .map((cells) => {
      const values: Record<string, string> = {};
      columns.forEach((col, idx) => {
        values[col.id] = String(cells[idx] ?? "").trim();
      });
      return {
        id: crypto.randomUUID(),
        values,
        found: false,
        foundDate: "",
        foundTime: "",
        scanCount: 0,
        comment: "",
      };
    });
  return { columns, rows };
}

export function processBaseScan(
  project: InventoryProject,
  raw: string,
): {
  project: InventoryProject;
  identifier: string;
  kind: "new" | "found" | "duplicate" | "surplus";
  baseRow: BaseRow | null;
  ledgerRowId: string;
} {
  const { identifier } = parseInventoryTokens(raw);
  let updated = addLedgerScan(project, raw);
  const ledgerRowId = updated.ledgerRows[updated.ledgerRows.length - 1]!.id;

  if (!project.mappingConfirmed || !project.baseIdColumnId) {
    return { project: updated, identifier, kind: "new", baseRow: null, ledgerRowId };
  }

  const baseRow = findBaseRowByIdentifier(updated, identifier);
  if (!baseRow) {
    updated = {
      ...updated,
      ledgerRows: updated.ledgerRows.map((r) =>
        r.id === ledgerRowId ? { ...r, status: "surplus" } : r,
      ),
    };
    return { project: updated, identifier, kind: "surplus", baseRow: null, ledgerRowId };
  }

  if (baseRow.found) {
    updated = {
      ...updated,
      ledgerRows: updated.ledgerRows.map((r) =>
        r.id === ledgerRowId ? { ...r, status: "duplicate", baseRowId: baseRow.id } : r,
      ),
    };
    return { project: updated, identifier, kind: "duplicate", baseRow, ledgerRowId };
  }

  const { date, time } = formatScanDateTime(nowIso());
  updated = {
    ...updated,
    ledgerRows: updated.ledgerRows.map((r) =>
      r.id === ledgerRowId ? { ...r, status: "found", baseRowId: baseRow.id } : r,
    ),
    baseRows: updated.baseRows.map((r) =>
      r.id === baseRow.id
        ? { ...r, found: true, foundDate: date, foundTime: time, scanCount: r.scanCount + 1 }
        : r,
    ),
  };
  return { project: updated, identifier, kind: "found", baseRow, ledgerRowId };
}

export function incrementScanOnly(project: InventoryProject, baseRowId: string): InventoryProject {
  return {
    ...project,
    baseRows: project.baseRows.map((r) =>
      r.id === baseRowId ? { ...r, scanCount: r.scanCount + 1 } : r,
    ),
    updatedAt: Date.now(),
  };
}

export function addDuplicateEntry(
  project: InventoryProject,
  entry: Omit<import("./types").DuplicateEntry, "id">,
): InventoryProject {
  return {
    ...project,
    duplicates: [{ ...entry, id: crypto.randomUUID() }, ...project.duplicates],
    updatedAt: Date.now(),
  };
}

export function addSurplusEntry(
  project: InventoryProject,
  entry: Omit<import("./types").SurplusEntry, "id">,
): InventoryProject {
  return {
    ...project,
    surpluses: [{ ...entry, id: crypto.randomUUID() }, ...project.surpluses],
    updatedAt: Date.now(),
  };
}

export function markExported(project: InventoryProject): InventoryProject {
  return { ...project, exportedOnce: true, updatedAt: Date.now() };
}

const BASE_COLUMN_HINT_GROUPS = [
  ["наимен", "name", "описан", "номенклат"],
  ["подраздел", "department", "отдел", "служб"],
  ["мол", "ответствен", "материально", "сотрудник"],
  ["мест", "локаци", "кабин", "адрес", "location", "склад"],
  ["категор", "групп", "вид", "тип"],
  ["серийн", "serial", "заводск"],
  ["баланс", "счет", "счёт", "стоим"],
] as const;

const MAX_BASE_COLUMNS_IN_LEDGER = 8;

export function ledgerStatusLabel(status: LedgerRowStatus): string {
  switch (status) {
    case "found":
      return "Найден";
    case "duplicate":
      return "Дубль";
    case "surplus":
      return "Излишек";
    default:
      return "Скан";
  }
}

/** Ключевые столбцы базы для отображения в ведомости (без столбца идентификатора). */
export function selectBaseDisplayColumns(project: InventoryProject): BaseColumn[] {
  if (project.scenario !== "with-base" || !project.baseColumns.length) return [];

  const used = new Set<string>();
  const result: BaseColumn[] = [];

  for (const hints of BASE_COLUMN_HINT_GROUPS) {
    const col = project.baseColumns.find(
      (c) =>
        c.id !== project.baseIdColumnId &&
        !used.has(c.id) &&
        hints.some((h) => c.name.toLowerCase().includes(h)),
    );
    if (col) {
      result.push(col);
      used.add(col.id);
    }
  }

  for (const col of project.baseColumns) {
    if (result.length >= MAX_BASE_COLUMNS_IN_LEDGER) break;
    if (col.id === project.baseIdColumnId || used.has(col.id)) continue;
    result.push(col);
    used.add(col.id);
  }

  return result;
}

export function buildLedgerTableView(project: InventoryProject): {
  columns: { id: string; name: string }[];
  rows: Record<string, string>[];
} {
  const baseCols = selectBaseDisplayColumns(project);
  const columns = [
    ...project.ledgerColumns,
    ...baseCols.map((c) => ({ id: `base-${c.id}`, name: c.name })),
    { id: "scannedAt", name: "Дата/время" },
    { id: "status", name: "Статус" },
  ];

  const rows = project.ledgerRows.map((row) => {
    const flat: Record<string, string> = { id: row.id };
    for (const col of project.ledgerColumns) {
      flat[col.id] = row.values[col.id] ?? "";
    }
    const baseRow = row.baseRowId ? project.baseRows.find((r) => r.id === row.baseRowId) : null;
    for (const col of baseCols) {
      flat[`base-${col.id}`] = baseRow?.values[col.id] ?? "";
    }
    flat.scannedAt = new Date(row.scannedAt).toLocaleString("ru-RU");
    flat.status = ledgerStatusLabel(row.status);
    return flat;
  });

  return { columns, rows };
}

export function baseInventoryStatusLabel(row: BaseRow, projectStatus: ProjectStatus): string {
  if (row.found) return "Найден";
  if (projectStatus === "completed") return "Не найден";
  return "Не проверен";
}

export type BaseTableFilter = "all" | "found" | "pending" | "not_found";

export function buildBaseTableView(project: InventoryProject): {
  columns: { id: string; name: string }[];
  rows: Record<string, string>[];
} {
  const columns = [
    ...project.baseColumns.map((c) => ({ id: c.id, name: c.name })),
    { id: "_inventoryStatus", name: "Статус инвентаризации" },
    { id: "_foundDate", name: "Дата" },
    { id: "_foundTime", name: "Время" },
    { id: "_scanCount", name: "Сканирований" },
  ];

  const rows = project.baseRows.map((row) => {
    const flat: Record<string, string> = { id: row.id };
    for (const col of project.baseColumns) {
      flat[col.id] = row.values[col.id] ?? "";
    }
    flat._inventoryStatus = baseInventoryStatusLabel(row, project.status);
    flat._foundDate = row.found || project.status === "completed" ? row.foundDate : "";
    flat._foundTime = row.found || project.status === "completed" ? row.foundTime : "";
    flat._scanCount = String(row.scanCount);
    return flat;
  });

  return { columns, rows };
}

export function filterBaseTableRows(
  rows: Record<string, string>[],
  filter: BaseTableFilter,
): Record<string, string>[] {
  if (filter === "all") return rows;
  return rows.filter((row) => {
    const status = row._inventoryStatus ?? "";
    if (filter === "found") return status === "Найден";
    if (filter === "pending") return status === "Не проверен";
    if (filter === "not_found") return status === "Не найден";
    return true;
  });
}

export function scanViewForProject(project: InventoryProject): "scan-a" | "scan-b" {
  return project.scenario === "without-base" ? "scan-a" : "scan-b";
}

export function isProjectReadOnly(project: InventoryProject): boolean {
  return project.status === "completed";
}

export function finalizeProject(project: InventoryProject): InventoryProject {
  const completedAt = nowIso();
  const { date, time } = formatScanDateTime(completedAt);
  const baseRows = project.baseRows.map((row) => {
    if (row.found) return row;
    return {
      ...row,
      foundDate: date,
      foundTime: time,
      comment: row.comment.trim() || "Не найден",
    };
  });
  return appendChangeLog(
    { ...project, status: "completed", baseRows, updatedAt: Date.now() },
    "complete",
    `Проект завершён ${new Date().toLocaleString("ru-RU")}`,
  );
}

export function reopenProject(project: InventoryProject): InventoryProject {
  return appendChangeLog(
    { ...project, status: "active", updatedAt: Date.now() },
    "reopen",
    `Проект переоткрыт ${new Date().toLocaleString("ru-RU")}`,
  );
}
