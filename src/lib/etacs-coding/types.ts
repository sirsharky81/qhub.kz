/** Public API shapes — never include raw dictionary bitmasks or option byte values. */

export interface EtacsProfileSummary {
  id: string;
  ecuName: string;
  skey: string;
  kind: string;
  codingBytes: number;
  parameterCount: number;
  model: string;
  unit: string;
  label: string;
}

export interface EtacsDecodedRow {
  id: number;
  name: string;
  nameRu: string;
  label: string | null;
  baselineLabel: string;
  editable: boolean;
  options: string[];
  optionsRu: Record<string, string>;
  outsideMut: boolean;
  detail: string;
  /** Индексы байтов кодировки, на которые влияет параметр (для подсветки в HEX, без битовых масок). */
  byteIndices?: number[];
}

export interface EtacsFileView {
  vin: string;
  date: string;
  ecuId: string;
  profileId: string;
  ecuName: string;
  availableProfiles: EtacsProfileSummary[];
  model: string;
  unit: string;
  status: string;
  readOnly: boolean;
  statusNote: string;
  crc: string;
  codingHex: string;
  codingBytes: number;
  copiesMatch: boolean;
  bom: boolean;
  crcVerified: boolean;
  crcComputed: string | null;
  crcNote?: string;
  hasDictionary: boolean;
  masksComplete: boolean;
  matchesBaseline: boolean;
  rows: EtacsDecodedRow[];
}

export interface EtacsApplyResult {
  codingHex: string;
  crc: string | null;
  crcVerified: boolean;
}

export interface EtacsSaveResult {
  crc: string;
  crcVerified: boolean;
  bytes: string;
  fileName: string;
}
