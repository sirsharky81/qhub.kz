export type CanProtocol = "6" | "7";

export interface CanFrame {
  id: string;
  dlc: number;
  data: number[];
}

export type MonitorEvent =
  | { kind: "frame"; frame: CanFrame }
  | { kind: "loss"; message: string }
  | { kind: "ignore" };

const LOSS = /BUFFER FULL|CAN ERROR|DATA ERROR/i;

export function idWidth(protocol: CanProtocol): number {
  return protocol === "6" ? 3 : 8;
}

export function normalizeCanToken(value: string, protocol: CanProtocol): string | null {
  const hex = value.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
  const width = idWidth(protocol);
  if (!hex || hex.length > width) return null;
  const max = protocol === "6" ? 0x7ff : 0x1fffffff;
  const numeric = Number.parseInt(hex, 16);
  if (!Number.isFinite(numeric) || numeric > max) return null;
  return hex.padStart(width, "0");
}

export function parseMonitorLine(line: string, protocol: CanProtocol): MonitorEvent {
  const trimmed = line.replace(/>/g, "").trim();
  if (!trimmed) return { kind: "ignore" };
  if (LOSS.test(trimmed)) return { kind: "loss", message: trimmed };
  if (/^(STOPPED|SEARCHING|OK|\?|ATMA)$/i.test(trimmed)) return { kind: "ignore" };

  if (/\s/.test(trimmed)) return parseSpaced(trimmed);
  return parseCompact(trimmed, protocol);
}

function parseSpaced(line: string): MonitorEvent {
  const tokens = line.toUpperCase().match(/[0-9A-F]+/g);
  if (!tokens || tokens.length < 2) return { kind: "ignore" };
  const id = tokens[0]!;
  const dlcToken = tokens[1]!;
  if (dlcToken.length !== 1) return { kind: "ignore" };
  const dlc = Number.parseInt(dlcToken, 16);
  const data = tokens.slice(2).map((token) => Number.parseInt(token, 16));
  if (data.some((byte) => Number.isNaN(byte))) return { kind: "ignore" };
  return { kind: "frame", frame: { id, dlc, data } };
}

function parseCompact(line: string, protocol: CanProtocol): MonitorEvent {
  const hex = line.toUpperCase().replace(/[^0-9A-F]/g, "");
  const width = idWidth(protocol);
  if (hex.length < width + 1) return { kind: "ignore" };
  const id = hex.slice(0, width);
  const dlc = Number.parseInt(hex.slice(width, width + 1), 16);
  const dataHex = hex.slice(width + 1);
  if (dataHex.length < dlc * 2) return { kind: "ignore" };
  const data: number[] = [];
  for (let i = 0; i < dlc; i++) {
    data.push(Number.parseInt(dataHex.slice(i * 2, i * 2 + 2), 16));
  }
  return { kind: "frame", frame: { id, dlc, data } };
}

export function formatFrameData(data: number[]): string {
  return data.map((byte) => byte.toString(16).padStart(2, "0").toUpperCase()).join(" ");
}

export interface CsvRow {
  t: string;
  id: string;
  dlc: string;
  data: string;
  note: string;
}

function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function framesToCsv(rows: CsvRow[], incomplete: boolean): string {
  const lines = ["t,id,dlc,data,note"];
  for (const row of rows) {
    lines.push([row.t, row.id, row.dlc, row.data, row.note].map(csvCell).join(","));
  }
  if (incomplete) {
    lines.push(
      [new Date().toISOString(), "", "", "", "незавершено: обрыв Bluetooth"].map(csvCell).join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}
