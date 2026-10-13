export interface BleAdapterInfo {
  id: string;
  name: string;
  transport: "web-bluetooth" | "capacitor-ble";
}

export interface BleLink {
  readonly info: BleAdapterInfo;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  writeLine(line: string): Promise<void>;
  /** Drop bytes left over from the previous command before the next write. */
  discardInput(): void;
  /** Read ELM response until prompt `>` or timeout. */
  readUntilPrompt(timeoutMs?: number): Promise<string>;
}

export function lineToElmBytes(line: string): Uint8Array<ArrayBuffer> {
  const normalized = line.endsWith("\r") ? line : `${line}\r`;
  return new TextEncoder().encode(normalized) as Uint8Array<ArrayBuffer>;
}
