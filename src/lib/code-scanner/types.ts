export type CodeScannerLocale = "ru" | "kk" | "en";

export type ScanMode = "simple" | "storage" | "inventory";

export type ScanPauseSeconds = 0.5 | 1 | 2;

export type OrgForm = "ip" | "too" | "ao" | "other";

export type ProjectStatus = "active" | "completed";

export type InventoryScenario = "without-base" | "with-base";

export type LedgerRowStatus = "scanned" | "found" | "surplus" | "duplicate";

export type MatchQuality = "yes" | "no" | "partial";

export interface ParsedTable {
  headers: string[];
  rows: string[][];
  raw: string;
}

export interface SimpleScanEntry {
  id: string;
  raw: string;
  table: ParsedTable | null;
  scannedAt: number;
  mode: "simple" | "storage";
}

export interface StorageBoxData {
  type: "storage";
  boxNumber: string;
  name: string;
  location: string[];
  items: { name: string; quantity: number; comment: string }[];
  comment: string;
  raw: string;
}

export interface StorageScanEntry {
  id: string;
  scannedAt: number;
  data: StorageBoxData | null;
  raw: string;
}

export interface LedgerColumn {
  id: string;
  name: string;
}

export interface LedgerRow {
  id: string;
  scannedAt: string;
  values: Record<string, string>;
  status: LedgerRowStatus;
  baseRowId?: string;
  scanCount: number;
}

export interface BaseColumn {
  id: string;
  name: string;
}

export interface BaseRow {
  id: string;
  values: Record<string, string>;
  found: boolean;
  foundDate: string;
  foundTime: string;
  scanCount: number;
  comment: string;
}

export interface DuplicateEntry {
  id: string;
  identifier: string;
  firstScanAt: string;
  duplicateScanAt: string;
  location: string;
  description: string;
  matchesBase: MatchQuality | "";
  comment: string;
  photoDataUrl: string | null;
}

export interface SurplusEntry {
  id: string;
  identifier: string;
  scannedAt: string;
  location: string;
  description: string;
  comment: string;
  photoDataUrl: string | null;
  rawValues: Record<string, string>;
}

export interface ChangeLogEntry {
  id: string;
  at: number;
  action: string;
  detail: string;
}

export interface InventoryProject {
  projectId: string;
  displayNumber: string;
  name: string;
  organization: string;
  orgForm: OrgForm;
  inventorName: string;
  startDate: string;
  comment: string;
  department: string;
  branch: string;
  address: string;
  defaultMol: string;
  orderNumber: string;
  commission: string;
  phone: string;
  email: string;
  plannedEndDate: string;
  photoEveryScan: boolean;
  scenario: InventoryScenario | null;
  status: ProjectStatus;
  createdAt: number;
  updatedAt: number;
  exportedOnce: boolean;
  baseColumns: BaseColumn[];
  baseRows: BaseRow[];
  baseIdColumnId: string | null;
  ledgerColumns: LedgerColumn[];
  ledgerRows: LedgerRow[];
  ledgerMatchColumnId: string | null;
  mappingConfirmed: boolean;
  duplicates: DuplicateEntry[];
  surpluses: SurplusEntry[];
  changeLog: ChangeLogEntry[];
  totalPhotoBytes: number;
}

export interface InventoryProjectSummary {
  projectId: string;
  displayNumber: string;
  name: string;
  createdAt: number;
  status: ProjectStatus;
  scenario: InventoryScenario | null;
  foundCount: number;
  totalBaseCount: number;
}

export interface BaseQualityReport {
  totalRows: number;
  emptyIdentifiers: number;
  duplicateIdentifiers: string[];
  emptyKeyFields: number;
}

export interface MatchPreviewResult {
  matched: number;
  total: number;
}

export interface ScanSessionSettings {
  pauseSeconds: ScanPauseSeconds;
  conveyorMode: boolean;
}

export const DEFAULT_SCAN_SETTINGS: ScanSessionSettings = {
  pauseSeconds: 1,
  conveyorMode: true,
};

export const IDENTIFIER_COLUMN_ID = "col-identifier";
export const IDENTIFIER_COLUMN_NAME = "Идентификатор";
export const EXTRA_COLUMN_PREFIX = "Доп. поле";

export const XLSX_ROW_LIMIT = 20_000;

export const PHOTO_SIZE_WARNING_BYTES = 50 * 1024 * 1024;

export const INVENTORY_EXPORT_VERSION = 1;

export interface InventoryExportFile {
  formatVersion: typeof INVENTORY_EXPORT_VERSION;
  exportedAt: number;
  project: InventoryProject;
}

export const ID_PREFIXES = ["INV", "ОС", "WR", "Asset", "Barcode"] as const;
