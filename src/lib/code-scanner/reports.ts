import type { InventoryProject } from "./types";
import { IDENTIFIER_COLUMN_ID } from "./types";
import { buildBaseTableView, buildLedgerTableView, ledgerStatusLabel } from "./project-utils";
import { matrixToCsv } from "./export-utils";

export interface ReportBundle {
  id: string;
  title: string;
  description?: string;
  featured?: boolean;
  rows: string[][];
}

function ledgerMatrix(project: InventoryProject): string[][] {
  const view = buildLedgerTableView(project);
  const headers = [...view.columns.map((c) => c.name), "Инвентаризатор"];
  const rows = view.rows.map((row) => [
    ...view.columns.map((c) => row[c.id] ?? ""),
    project.inventorName,
  ]);
  return [headers, ...rows];
}

function baseFoundMatrix(project: InventoryProject): string[][] {
  const headers = [
    ...project.baseColumns.map((c) => c.name),
    "Найден",
    "Дата обнаружения",
    "Время обнаружения",
    "Количество сканирований",
    "Комментарий",
  ];
  const rows = project.baseRows
    .filter((r) => r.found)
    .map((r) => [
      ...project.baseColumns.map((c) => r.values[c.id] ?? ""),
      "да",
      r.foundDate,
      r.foundTime,
      String(r.scanCount),
      r.comment,
    ]);
  return [headers, ...rows];
}

function shortagesMatrix(project: InventoryProject): string[][] {
  const headers = [...project.baseColumns.map((c) => c.name), "Найден"];
  const rows = project.baseRows
    .filter((r) => !r.found)
    .map((r) => [...project.baseColumns.map((c) => r.values[c.id] ?? ""), "нет"]);
  return [headers, ...rows];
}

function surplusesMatrix(project: InventoryProject): string[][] {
  const headers = ["Идентификатор", "Дата", "Место находки", "Описание", "Комментарий"];
  const rows = project.surpluses.map((s) => [
    s.identifier,
    new Date(s.scannedAt).toLocaleString("ru-RU"),
    s.location,
    s.description,
    s.comment,
  ]);
  return [headers, ...rows];
}

function duplicatesMatrix(project: InventoryProject): string[][] {
  const headers = [
    "Идентификатор",
    "Первый скан",
    "Дубль",
    "Место находки",
    "Описание",
    "Соответствие базе",
    "Комментарий",
  ];
  const rows = project.duplicates.map((d) => [
    d.identifier,
    d.firstScanAt,
    d.duplicateScanAt,
    d.location,
    d.description,
    d.matchesBase,
    d.comment,
  ]);
  return [headers, ...rows];
}

function summaryMatrix(project: InventoryProject): string[][] {
  const total = project.baseRows.length;
  const found = project.baseRows.filter((r) => r.found).length;
  const notFound = total - found;
  const surpluses = project.surpluses.length;
  const duplicates = project.duplicates.length;
  const pct = total ? Math.round((found / total) * 100) : 0;
  return [
    ["Показатель", "Значение"],
    ["Всего в базе", String(total)],
    ["Найдено", String(found)],
    ["Не найдено", String(notFound)],
    ["Излишков", String(surpluses)],
    ["Дублей", String(duplicates)],
    ["% выполнения", `${pct}%`],
    ["Проект", project.displayNumber],
    ["Название", project.name],
    ["Организация", project.organization],
    ["Инвентаризатор", project.inventorName],
  ];
}

/** Полная база ОС + результаты инвентаризации — для загрузки в 1С и другие учётные системы. */
export function buildFullBaseForImportMatrix(project: InventoryProject): string[][] {
  if (!project.baseRows.length) {
    return [["Нет данных в базе ОС"]];
  }

  const view = buildBaseTableView(project);
  const tailHeaders = [
    "Найден (да/нет)",
    "Номер проекта инвентаризации",
    "Организация",
    "Инвентаризатор",
    "Статус проекта",
  ];
  const headers = [...view.columns.map((c) => c.name), ...tailHeaders];
  const projectStatusLabel = project.status === "completed" ? "Завершён" : "Активный";

  const rows = project.baseRows.map((baseRow, index) => {
    const flat = view.rows[index]!;
    const foundYesNo = baseRow.found ? "да" : project.status === "completed" ? "нет" : "";
    return [
      ...view.columns.map((c) => flat[c.id] ?? ""),
      foundYesNo,
      project.displayNumber,
      project.organization,
      project.inventorName,
      projectStatusLabel,
    ];
  });

  return [headers, ...rows];
}

export function buildReports(project: InventoryProject): ReportBundle[] {
  const reports: ReportBundle[] = [
    { id: "full", title: "Полная ведомость сканирования", rows: ledgerMatrix(project) },
    { id: "found", title: "Найденные объекты", rows: baseFoundMatrix(project) },
    { id: "shortages", title: "Недостачи", rows: shortagesMatrix(project) },
    { id: "surpluses", title: "Излишки", rows: surplusesMatrix(project) },
    { id: "duplicates", title: "Дублирующиеся метки", rows: duplicatesMatrix(project) },
    { id: "summary", title: "Сводка", rows: summaryMatrix(project) },
  ];

  if (project.scenario === "with-base" && project.baseRows.length > 0) {
    reports.unshift({
      id: "full-base-import",
      title: "Полная база ОС с результатами инвентаризации",
      description:
        "Все строки загруженной базы с полями «Статус», «Дата/время», «Сканирований» и реквизитами проекта. CSV с BOM — для импорта в 1С и другие учётные системы.",
      featured: true,
      rows: buildFullBaseForImportMatrix(project),
    });
  }

  return reports;
}

export function getFeaturedBaseImportReport(project: InventoryProject): ReportBundle | null {
  return buildReports(project).find((r) => r.id === "full-base-import") ?? null;
}

export function reportToCsvContent(rows: string[][]): string {
  return `\uFEFF${matrixToCsv(rows)}`;
}

function findCol(project: InventoryProject, hints: string[]): string | null {
  const col = project.baseColumns.find((c) => hints.some((h) => c.name.toLowerCase().includes(h)));
  return col?.id ?? null;
}

export function getLastScanCard(project: InventoryProject): {
  identifier: string;
  name: string;
  mol: string;
  location: string;
  status: string;
  statusLabel: string;
} | null {
  const last = project.ledgerRows[project.ledgerRows.length - 1];
  if (!last) return null;
  const identifier = last.values[IDENTIFIER_COLUMN_ID] ?? "";
  let name = "";
  let mol = "";
  let location = "";
  if (last.baseRowId) {
    const base = project.baseRows.find((r) => r.id === last.baseRowId);
    if (base) {
      const nameCol = findCol(project, ["наимен"]);
      const molCol = findCol(project, ["мол", "ответ"]);
      const locCol = findCol(project, ["кабин", "мест"]);
      if (nameCol) name = base.values[nameCol] ?? "";
      if (molCol) mol = base.values[molCol] ?? "";
      if (locCol) location = base.values[locCol] ?? "";
    }
  }
  return {
    identifier,
    name,
    mol,
    location,
    status: last.status,
    statusLabel: ledgerStatusLabel(last.status),
  };
}
