export type ShareControlMessage =
  | { t: "hello"; deviceName: string }
  | { t: "transfer-offer"; transferId: string; files: ShareFileMeta[] }
  | { t: "transfer-accept"; transferId: string }
  | { t: "transfer-reject"; transferId: string }
  | { t: "transfer-cancel"; transferId: string }
  | { t: "file-start"; transferId: string; fileId: string; name: string; size: number; sha256: string; offset?: number }
  | { t: "file-chunk"; transferId: string; fileId: string; offset: number; data: string }
  | { t: "file-done"; transferId: string; fileId: string; sha256: string }
  | { t: "file-error"; transferId: string; fileId: string; reason: string };

export interface ShareFileMeta {
  id: string;
  name: string;
  size: number;
  type: string;
  /** Path inside a folder transfer, e.g. photos/vacation/img.jpg */
  relativePath?: string;
}

export const CHUNK_SIZE = 768 * 1024;

export function encodeControlMessage(msg: ShareControlMessage): string {
  return JSON.stringify(msg);
}

export function decodeControlMessage(raw: string): ShareControlMessage | null {
  try {
    const parsed = JSON.parse(raw) as ShareControlMessage;
    if (!parsed || typeof parsed !== "object" || !("t" in parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
