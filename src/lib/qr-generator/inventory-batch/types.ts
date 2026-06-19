import type { CodeMarkType, LabelFormat } from "@/lib/qr-generator/types";

export type BatchSource = "upload" | "qhub-inventory";
export type BatchStep = "upload" | "quality" | "workspace";
export type LabelFilter = "all" | "generated" | "not_generated";

export interface BatchColumn {
  id: string;
  name: string;
}

export interface BatchRow {
  id: string;
  values: Record<string, string>;
  labelGenerated: boolean;
  labelGeneratedAt?: number;
}

export interface FieldColumnMapping {
  inventoryNumber: string | null;
  itemName: string | null;
  department: string | null;
  responsible: string | null;
  serialNumber: string | null;
}

export interface InventoryLabelBatch {
  batchId: string;
  name: string;
  source: BatchSource;
  createdAt: number;
  updatedAt: number;
  step: BatchStep;
  columns: BatchColumn[];
  rows: BatchRow[];
  idColumnId: string | null;
  fieldMapping: FieldColumnMapping;
  mappingConfirmed: boolean;
  organization?: string;
  department?: string;
}

export interface BatchQualityReport {
  totalRows: number;
  emptyIdentifiers: number;
  duplicateIdentifiers: string[];
  emptyNameFields: number;
}

export interface InvNumberPattern {
  prefix: string;
  width: number;
  separator: string;
}

export interface BatchLabelOptions {
  codeType: CodeMarkType;
  labelFormat: LabelFormat;
}

export const MAX_BATCH_ROWS = 5000;
export const MAX_BATCH_FILE_BYTES = 15 * 1024 * 1024;
export const MAX_PDF_BATCH = 500;
export const GENERATED_COLUMN_NAME = "Метка сформирована";
export const GENERATED_AT_COLUMN_NAME = "Дата формирования метки";
export const INV_NUMBER_COLUMN_NAME = "Инв.номер";

export const DEFAULT_FIELD_MAPPING: FieldColumnMapping = {
  inventoryNumber: null,
  itemName: null,
  department: null,
  responsible: null,
  serialNumber: null,
};

export function createEmptyBatch(name = "База ОС"): InventoryLabelBatch {
  const now = Date.now();
  return {
    batchId: crypto.randomUUID(),
    name,
    source: "upload",
    createdAt: now,
    updatedAt: now,
    step: "upload",
    columns: [],
    rows: [],
    idColumnId: null,
    fieldMapping: { ...DEFAULT_FIELD_MAPPING },
    mappingConfirmed: false,
  };
}
