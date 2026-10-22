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
  /** Bytes received since the previous pull. Does not wait for `>`. */
  pullPending(): string;
  /** Called when the adapter drops the link. Ignored for an intentional disconnect. */
  setDisconnectListener(listener: (() => void) | null): void;
  /** Read ELM response until prompt `>` or timeout. */
  readUntilPrompt(timeoutMs?: number): Promise<string>;
}

/**
 * Default GATT payload size (ATT_MTU 23 - 3 = 20 bytes).
 * Sending a 135-byte command (e.g. `3BB2` + 65 bytes of `.cuf` hex + `\r`) in a single
 * BLE characteristic write truncates or drops bytes on iOS Web Bluetooth / Bluefy / Android
 * when the negotiated ATT_MTU is 20 bytes, causing the ELM/vLinker UART parser to reply `?`.
 */
export const BLE_WRITE_CHUNK_BYTES = 20;

export function lineToElmBytes(line: string): Uint8Array<ArrayBuffer> {
  const normalized = line.endsWith("\r") ? line : `${line}\r`;
  return new TextEncoder().encode(normalized) as Uint8Array<ArrayBuffer>;
}

export function chunkElmWriteBytes(
  bytes: Uint8Array<ArrayBuffer>,
  chunkSize = BLE_WRITE_CHUNK_BYTES,
): Uint8Array<ArrayBuffer>[] {
  if (bytes.length <= chunkSize) return [bytes];
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const slice = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
    const copy = new Uint8Array(new ArrayBuffer(slice.length));
    copy.set(slice);
    chunks.push(copy);
  }
  return chunks;
}
