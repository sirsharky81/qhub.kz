import { MAX_SESSION_BYTES } from "./constants";
import { sha256Hex } from "./sha256";
import {
  CHUNK_SIZE,
  arrayBufferToBase64,
  base64ToArrayBuffer,
  decodeControlMessage,
  encodeControlMessage,
  type ShareControlMessage,
  type ShareFileMeta,
} from "./transfer-protocol";
import type { SharePeerConnection } from "./webrtc-session";

export interface TransferProgress {
  transferId: string;
  fileId: string;
  fileName: string;
  bytesSent: number;
  bytesTotal: number;
  speedBps: number;
  etaSec: number | null;
}

export interface TransferQueueItem {
  id: string;
  file: File;
  status: "pending" | "transferring" | "done" | "error" | "cancelled";
  progress: number;
  error?: string;
}

export type TransferCallbacks = {
  onQueueUpdate?: (items: TransferQueueItem[]) => void;
  onProgress?: (progress: TransferProgress) => void;
  onIncomingOffer?: (transferId: string, files: ShareFileMeta[]) => void;
  onTransferComplete?: () => void;
  onError?: (err: Error) => void;
};

export class ShareTransferManager {
  private queue: TransferQueueItem[] = [];
  private cancelled = false;
  private activeTransferId: string | null = null;
  private pendingOffer: { transferId: string; files: ShareFileMeta[] } | null = null;
  private receiveBuffers = new Map<string, { name: string; size: number; sha256: string; parts: Map<number, ArrayBuffer> }>();
  private speedSamples: { at: number; bytes: number }[] = [];

  constructor(
    private peer: SharePeerConnection,
    private callbacks: TransferCallbacks,
  ) {
    this.unsub = peer.onMessage((raw) => {
      void this.handleMessage(raw);
    });
  }

  private unsub: (() => void) | null = null;

  setFiles(files: File[]): void {
    const total = files.reduce((sum, f) => sum + f.size, 0);
    if (total > MAX_SESSION_BYTES) {
      this.callbacks.onError?.(new Error("Суммарный размер файлов превышает 1 ГБ"));
      return;
    }
    this.queue = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      status: "pending" as const,
      progress: 0,
    }));
    this.callbacks.onQueueUpdate?.(this.queue);
  }

  async startSend(): Promise<void> {
    if (!this.peer.isConnected()) {
      this.callbacks.onError?.(new Error("Нет соединения с собеседником"));
      return;
    }
    const transferId = crypto.randomUUID();
    this.activeTransferId = transferId;
    this.cancelled = false;

    const files: ShareFileMeta[] = this.queue.map((item) => ({
      id: item.id,
      name: item.file.name,
      size: item.file.size,
      type: item.file.type || "application/octet-stream",
    }));

    this.peer.send(
      encodeControlMessage({ t: "transfer-offer", transferId, files }),
    );
  }

  acceptIncoming(): void {
    if (!this.pendingOffer) return;
    this.peer.send(
      encodeControlMessage({ t: "transfer-accept", transferId: this.pendingOffer.transferId }),
    );
    void this.receiveTransfer(this.pendingOffer.transferId, this.pendingOffer.files);
    this.pendingOffer = null;
  }

  rejectIncoming(): void {
    if (!this.pendingOffer) return;
    this.peer.send(
      encodeControlMessage({ t: "transfer-reject", transferId: this.pendingOffer.transferId }),
    );
    this.pendingOffer = null;
  }

  cancel(): void {
    this.cancelled = true;
    if (this.activeTransferId) {
      this.peer.send(
        encodeControlMessage({ t: "transfer-cancel", transferId: this.activeTransferId }),
      );
    }
    for (const item of this.queue) {
      if (item.status === "pending" || item.status === "transferring") {
        item.status = "cancelled";
      }
    }
    this.callbacks.onQueueUpdate?.([...this.queue]);
    this.receiveBuffers.clear();
  }

  private async handleMessage(raw: string): Promise<void> {
    const msg = decodeControlMessage(raw);
    if (!msg) return;

    switch (msg.t) {
      case "transfer-offer":
        this.pendingOffer = { transferId: msg.transferId, files: msg.files };
        this.callbacks.onIncomingOffer?.(msg.transferId, msg.files);
        break;
      case "transfer-accept":
        if (msg.transferId === this.activeTransferId) {
          await this.sendTransfer(msg.transferId);
        }
        break;
      case "transfer-reject":
        if (msg.transferId === this.activeTransferId) {
          this.callbacks.onError?.(new Error("Получатель отклонил передачу"));
          this.activeTransferId = null;
        }
        break;
      case "transfer-cancel":
        this.cancelled = true;
        this.receiveBuffers.clear();
        break;
      case "file-start":
        this.receiveBuffers.set(msg.fileId, {
          name: msg.name,
          size: msg.size,
          sha256: msg.sha256,
          parts: new Map(),
        });
        {
          const existing = this.queue.find((q) => q.id === msg.fileId);
          if (existing) {
            existing.status = "transferring";
          } else {
            this.queue.push({
              id: msg.fileId,
              file: new File([], msg.name),
              status: "transferring",
              progress: 0,
            });
          }
          this.callbacks.onQueueUpdate?.([...this.queue]);
        }
        break;
      case "file-chunk":
        this.handleChunk(msg);
        break;
      case "file-done":
        await this.handleFileDone(msg);
        break;
      case "file-error":
        this.callbacks.onError?.(new Error(msg.reason));
        break;
      default:
        break;
    }
  }

  private async sendTransfer(transferId: string): Promise<void> {
    for (const item of this.queue) {
      if (this.cancelled) break;
      item.status = "transferring";
      this.callbacks.onQueueUpdate?.([...this.queue]);

      const sha256 = await sha256Hex(item.file);
      this.peer.send(
        encodeControlMessage({
          t: "file-start",
          transferId,
          fileId: item.id,
          name: item.file.name,
          size: item.file.size,
          sha256,
        }),
      );

      let offset = 0;
      const started = Date.now();
      while (offset < item.file.size && !this.cancelled) {
        const chunk = item.file.slice(offset, offset + CHUNK_SIZE);
        const buffer = await chunk.arrayBuffer();
        this.peer.send(
          encodeControlMessage({
            t: "file-chunk",
            transferId,
            fileId: item.id,
            offset,
            data: arrayBufferToBase64(buffer),
          }),
        );
        offset += buffer.byteLength;
        item.progress = Math.round((offset / item.file.size) * 100);
        this.callbacks.onQueueUpdate?.([...this.queue]);
        this.emitProgress(transferId, item.id, item.file.name, offset, item.file.size, started);
        await new Promise((r) => setTimeout(r, 0));
      }

      if (this.cancelled) {
        item.status = "cancelled";
        break;
      }

      this.peer.send(
        encodeControlMessage({ t: "file-done", transferId, fileId: item.id, sha256 }),
      );
      item.status = "done";
      item.progress = 100;
      this.callbacks.onQueueUpdate?.([...this.queue]);
    }
    this.activeTransferId = null;
    this.callbacks.onTransferComplete?.();
  }

  private async receiveTransfer(transferId: string, files: ShareFileMeta[]): Promise<void> {
    for (const meta of files) {
      this.receiveBuffers.set(meta.id, {
        name: meta.name,
        size: meta.size,
        sha256: "",
        parts: new Map(),
      });
    }
    this.queue = files.map((meta) => ({
      id: meta.id,
      file: new File([], meta.name, { type: meta.type }),
      status: "pending" as const,
      progress: 0,
    }));
    this.callbacks.onQueueUpdate?.([...this.queue]);
  }

  private handleChunk(msg: Extract<ShareControlMessage, { t: "file-chunk" }>): void {
    const buf = this.receiveBuffers.get(msg.fileId);
    if (!buf) return;
    buf.parts.set(msg.offset, base64ToArrayBuffer(msg.data));
    const received = [...buf.parts.values()].reduce((s, p) => s + p.byteLength, 0);
    const item = this.queue.find((q) => q.id === msg.fileId);
    if (item) {
      item.status = "transferring";
      item.progress = Math.round((received / buf.size) * 100);
      this.callbacks.onQueueUpdate?.([...this.queue]);
    }
    this.emitProgress(msg.transferId, msg.fileId, buf.name, received, buf.size, Date.now());
  }

  private async handleFileDone(msg: Extract<ShareControlMessage, { t: "file-done" }>): Promise<void> {
    const buf = this.receiveBuffers.get(msg.fileId);
    if (!buf) return;

    const merged = new Uint8Array(buf.size);
    for (const [offset, part] of [...buf.parts.entries()].sort((a, b) => a[0] - b[0])) {
      merged.set(new Uint8Array(part), offset);
    }
    const blob = new Blob([merged]);
    const hash = await sha256Hex(blob);
    const item = this.queue.find((q) => q.id === msg.fileId);

    if (hash !== msg.sha256) {
      if (item) {
        item.status = "error";
        item.error = "SHA-256 не совпадает";
      }
      this.callbacks.onError?.(new Error(`Файл ${buf.name}: контрольная сумма не совпадает`));
      this.receiveBuffers.delete(msg.fileId);
      this.callbacks.onQueueUpdate?.([...this.queue]);
      return;
    }

    const { saveBlobToDevice } = await import("@/lib/platform/save-file");
    await saveBlobToDevice(blob, buf.name);
    if (item) {
      item.status = "done";
      item.progress = 100;
    }
    this.receiveBuffers.delete(msg.fileId);
    this.callbacks.onQueueUpdate?.([...this.queue]);

    if (this.queue.every((q) => q.status === "done" || q.status === "error")) {
      this.callbacks.onTransferComplete?.();
    }
  }

  private emitProgress(
    transferId: string,
    fileId: string,
    fileName: string,
    bytesSent: number,
    bytesTotal: number,
    startedAt: number,
  ): void {
    const now = Date.now();
    this.speedSamples.push({ at: now, bytes: bytesSent });
    this.speedSamples = this.speedSamples.filter((s) => now - s.at < 3000);
    const oldest = this.speedSamples[0];
    const speedBps =
      oldest && now > oldest.at ? (bytesSent - oldest.bytes) / ((now - oldest.at) / 1000) : 0;
    const remaining = bytesTotal - bytesSent;
    const etaSec = speedBps > 0 ? remaining / speedBps : null;
    this.callbacks.onProgress?.({
      transferId,
      fileId,
      fileName,
      bytesSent,
      bytesTotal,
      speedBps,
      etaSec,
    });
  }

  getPendingOffer() {
    return this.pendingOffer;
  }

  destroy(): void {
    this.unsub?.();
  }
}
