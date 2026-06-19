import type { InventoryExportFile, InventoryProject } from "@/lib/code-scanner/types";
import type { InventoryLabelBatch } from "./types";
import { autoDetectFieldMapping, suggestIdColumn } from "./column-mapping";

export async function parseQhubInventoryFile(file: File): Promise<InventoryLabelBatch> {
  const text = await file.text();
  const parsed = JSON.parse(text) as InventoryExportFile | InventoryProject;
  const project =
    "formatVersion" in parsed && parsed.project ? parsed.project : (parsed as InventoryProject);

  if (!project.projectId || !project.baseColumns?.length) {
    throw new Error("invalid_qhub_file");
  }

  const columns = project.baseColumns.map((c) => ({ id: c.id, name: c.name }));
  const rows = project.baseRows.map((r) => ({
    id: r.id,
    values: { ...r.values },
    labelGenerated: false,
  }));

  const fieldMapping = autoDetectFieldMapping(columns);
  const idColumnId = project.baseIdColumnId ?? suggestIdColumn(columns, fieldMapping.inventoryNumber);
  if (fieldMapping.inventoryNumber == null && idColumnId) {
    fieldMapping.inventoryNumber = idColumnId;
  }

  const now = Date.now();
  return {
    batchId: crypto.randomUUID(),
    name: project.displayNumber ? `${project.displayNumber} — ${project.name}` : project.name,
    source: "qhub-inventory",
    createdAt: now,
    updatedAt: now,
    step: "quality",
    columns,
    rows,
    idColumnId,
    fieldMapping,
    mappingConfirmed: false,
    organization: project.organization,
    department: project.department,
  };
}
