import { MAX_SESSION_BYTES } from "./constants";
import type { PickedShareFile } from "./pick-files";
import { hasFolderStructure } from "./pick-files";
import { saveFilesAsZip, saveReceivedFile } from "./save-received";
import { sha256Hex } from "./sha256";
import {
  clearResumeState,
  loadResumeState,
  loadSavedChunks,
  persistReceiveProgress,
} from "./transfer-resume";
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
  direction: "out" | "in";
  bytesSent: number;
  bytesTotal: number;
  speedBps: number;
  etaSec: number | null;
}

export interface TransferQueueItem {
  id: string;
  file: File;
  relativePath: string;
  status: "pending" | "transferring" | "done" | "error" | "cancelled";
  progress: number;
  previewUrl?: string | null;
  error?: string;
  transferId?: string;
}

export interface IncomingTransferOffer {
  transferId: string;
  files: ShareFileMeta[];
}

export type TransferCallbacks = {
  onOutboundUpdate?: (items: TransferQueueItem[]) => void;
  onInboundUpdate?: (transferId: string, items: TransferQueueItem[]) => void;
  onIncomingOffers?: (offers: IncomingTransferOffer[]) => void;
  onProgress?: (progress: TransferProgress) => void;
  onTransferComplete?: (direction: "out" | "in", transferId: string) => void;
  onError?: (err: Error) => void;
};

interface ReceiveBuffer {
  relativePath: string;
  size: number;
  sha256: string;
  parts: Map<number, ArrayBuffer>;
}

export class ShareTransferManager {
  private outboundQueue: TransferQueueItem[] = [];
  private inboundQueues = new Map<string, TransferQueueItem[]>();
  private pendingOffers: IncomingTransferOffer[] = [];
  private cancelledTransfers = new Set<string>();
  private sendingTransfers = new Set<string>();
  private receiveBuffers = new Map<string, ReceiveBuffer>();
  private receivedByTransfer = new Map<string, Array<{ name: string; blob: Blob }>>();
  private speedSamples: { at: number; bytes: number }[] = [];
  private resumeOffsets = new Map<string, number>();

  constructor(
    private peer: SharePeerConnection,
    private roomId: string,
    private callbacks: TransferCallbacks,
  ) {
    this.unsub = peer.onMessage((raw) => {
      void this.handleMessage(raw);
    });
  }

  private unsub: (() => void) | null = null;

  setFiles(picked: PickedShareFile[]): void {
    const total = picked.reduce((sum, f) => sum + f.file.size, 0);
    if (total > MAX_SESSION_BYTES) {
      this.callbacks.onError?.(new Error("Суммарный размер файлов превышает 1 ГБ"));
      return;
    }
    const newItems = picked.map(({ file, relativePath }) => ({
      id: crypto.randomUUID(),
      file,
      relativePath,
      status: "pending" as const,
      progress: 0,
      previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
    }));
    this.outboundQueue = [...this.outboundQueue.filter((q) => q.status === "transferring"), ...newItems];
    this.callbacks.onOutboundUpdate?.([...this.outboundQueue]);
  }

  async startSend(): Promise<void> {
    if (!this.peer.isConnected()) {
      this.callbacks.onError?.(new Error("Нет соединения с собеседником"));
      return;
    }
    const pending = this.outboundQueue.filter((q) => q.status === "pending");
    if (!pending.length) return;

    const transferId = crypto.randomUUID();
    this.sendingTransfers.add(transferId);
    this.cancelledTransfers.delete(transferId);

    for (const item of pending) {
      item.transferId = transferId;
    }

    const files: ShareFileMeta[] = pending.map((item) => ({
      id: item.id,
      name: item.file.name,
      size: item.file.size,
      type: item.file.type || "application/octet-stream",
      relativePath: item.relativePath !== item.file.name ? item.relativePath : undefined,
    }));

    this.peer.send(encodeControlMessage({ t: "transfer-offer", transferId, files }));
  }

  acceptIncoming(transferId: string): void {
    const offer = this.pendingOffers.find((o) => o.transferId === transferId);
    if (!offer) return;
    this.peer.send(encodeControlMessage({ t: "transfer-accept", transferId }));
    void this.prepareInbound(offer);
    this.pendingOffers = this.pendingOffers.filter((o) => o.transferId !== transferId);
    this.callbacks.onIncomingOffers?.([...this.pendingOffers]);
  }

  rejectIncoming(transferId: string): void {
    this.peer.send(encodeControlMessage({ t: "transfer-reject", transferId }));
    this.pendingOffers = this.pendingOffers.filter((o) => o.transferId !== transferId);
    this.callbacks.onIncomingOffers?.([...this.pendingOffers]);
  }

  cancelOutbound(): void {
    for (const transferId of this.sendingTransfers) {
      this.cancelledTransfers.add(transferId);
      this.peer.send(encodeControlMessage({ t: "transfer-cancel", transferId }));
    }
    for (const item of this.outboundQueue) {
      if (item.status === "pending" || item.status === "transferring") {
        item.status = "cancelled";
      }
    }
    this.sendingTransfers.clear();
    this.callbacks.onOutboundUpdate?.([...this.outboundQueue]);
  }

  cancelInbound(transferId: string): void {
    this.cancelledTransfers.add(transferId);
    this.peer.send(encodeControlMessage({ t: "transfer-cancel", transferId }));
    this.inboundQueues.delete(transferId);
    this.receivedByTransfer.delete(transferId);
    this.callbacks.onInboundUpdate?.(transferId, []);
  }

  getPendingOffers(): IncomingTransferOffer[] {
    return [...this.pendingOffers];
  }

  getOutboundQueue(): TransferQueueItem[] {
    return [...this.outboundQueue];
  }

  getInboundQueue(transferId: string): TransferQueueItem[] {
    return [...(this.inboundQueues.get(transferId) ?? [])];
  }

  getAllInboundQueues(): Map<string, TransferQueueItem[]> {
    return new Map(this.inboundQueues);
  }

  private async prepareInbound(offer: IncomingTransferOffer): Promise<void> {
    this.receivedByTransfer.set(offer.transferId, []);
    const items: TransferQueueItem[] = offer.files.map((meta) => ({
      id: meta.id,
      file: new File([], meta.name, { type: meta.type }),
      relativePath: meta.relativePath ?? meta.name,
      status: "pending",
      progress: 0,
    }));
    this.inboundQueues.set(offer.transferId, items);
    this.callbacks.onInboundUpdate?.(offer.transferId, items);

    for (const meta of offer.files) {
      const saved = await loadResumeState(this.roomId, meta.id);
      if (saved && saved.sha256) {
        this.resumeOffsets.set(`${offer.transferId}:${meta.id}`, saved.contiguousOffset);
        this.peer.send(
          encodeControlMessage({
            t: "file-resume",
            transferId: offer.transferId,
            fileId: meta.id,
            offset: saved.contiguousOffset,
          }),
        );
      }
    }
  }

  private async handleMessage(raw: string): Promise<void> {
    const msg = decodeControlMessage(raw);
    if (!msg) return;

    switch (msg.t) {
      case "transfer-offer":
        if (!this.pendingOffers.some((o) => o.transferId === msg.transferId)) {
          this.pendingOffers.push({ transferId: msg.transferId, files: msg.files });
          this.callbacks.onIncomingOffers?.([...this.pendingOffers]);
        }
        break;
      case "transfer-accept":
        if (this.sendingTransfers.has(msg.transferId)) {
          await this.sendTransfer(msg.transferId);
        }
        break;
      case "transfer-reject":
        this.sendingTransfers.delete(msg.transferId);
        this.callbacks.onError?.(new Error("Получатель отклонил передачу"));
        break;
      case "transfer-cancel":
        this.cancelledTransfers.add(msg.transferId);
        this.sendingTransfers.delete(msg.transferId);
        this.inboundQueues.delete(msg.transferId);
        break;
      case "file-resume":
        this.resumeOffsets.set(`${msg.transferId}:${msg.fileId}`, msg.offset);
        break;
      case "file-start":
        await this.handleFileStart(msg);
        break;
      case "file-chunk":
        await this.handleChunk(msg);
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
    const items = this.outboundQueue.filter(
      (q) =>
        q.transferId === transferId &&
        (q.status === "pending" || q.status === "transferring"),
    );
    for (const item of items) {
      if (this.cancelledTransfers.has(transferId)) break;
      item.status = "transferring";
      this.callbacks.onOutboundUpdate?.([...this.outboundQueue]);

      const sha256 = await sha256Hex(item.file);
      const pathName = item.relativePath;
      this.peer.send(
        encodeControlMessage({
          t: "file-start",
          transferId,
          fileId: item.id,
          name: pathName,
          size: item.file.size,
          sha256,
        }),
      );

      let offset = await this.waitForResumeOffset(transferId, item.id);
      const started = Date.now();
      while (offset < item.file.size && !this.cancelledTransfers.has(transferId)) {
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
        this.callbacks.onOutboundUpdate?.([...this.outboundQueue]);
        this.emitProgress(transferId, item.id, pathName, "out", offset, item.file.size, started);
        await new Promise((r) => setTimeout(r, 0));
      }

      if (this.cancelledTransfers.has(transferId)) {
        item.status = "cancelled";
        break;
      }

      this.peer.send(
        encodeControlMessage({ t: "file-done", transferId, fileId: item.id, sha256 }),
      );
      item.status = "done";
      item.progress = 100;
      this.callbacks.onOutboundUpdate?.([...this.outboundQueue]);
    }
    this.sendingTransfers.delete(transferId);
    this.callbacks.onTransferComplete?.("out", transferId);
  }

  private async handleFileStart(msg: Extract<ShareControlMessage, { t: "file-start" }>): Promise<void> {
    if (this.cancelledTransfers.has(msg.transferId)) return;

    const saved = await loadResumeState(this.roomId, msg.fileId);
    let parts = new Map<number, ArrayBuffer>();
    if (saved && saved.sha256 === msg.sha256 && saved.contiguousOffset > 0) {
      parts = await loadSavedChunks(this.roomId, msg.fileId, saved.chunkKeys);
      this.resumeOffsets.set(`${msg.transferId}:${msg.fileId}`, saved.contiguousOffset);
      this.peer.send(
        encodeControlMessage({
          t: "file-resume",
          transferId: msg.transferId,
          fileId: msg.fileId,
          offset: saved.contiguousOffset,
        }),
      );
    }

    this.receiveBuffers.set(msg.fileId, {
      relativePath: msg.name,
      size: msg.size,
      sha256: msg.sha256,
      parts,
    });

    const queue = this.inboundQueues.get(msg.transferId) ?? [];
    let item = queue.find((q) => q.id === msg.fileId);
    if (!item) {
      item = {
        id: msg.fileId,
        file: new File([], msg.name),
        relativePath: msg.name,
        status: "transferring",
        progress: 0,
      };
      queue.push(item);
      this.inboundQueues.set(msg.transferId, queue);
    } else {
      item.status = "transferring";
    }
    if (parts.size > 0) {
      const received = [...parts.values()].reduce((s, p) => s + p.byteLength, 0);
      item.progress = Math.round((received / msg.size) * 100);
    }
    this.callbacks.onInboundUpdate?.(msg.transferId, [...queue]);
  }

  private waitForResumeOffset(transferId: string, fileId: string, timeoutMs = 400): Promise<number> {
    const key = `${transferId}:${fileId}`;
    const existing = this.resumeOffsets.get(key);
    if (existing !== undefined) return Promise.resolve(existing);

    return new Promise((resolve) => {
      const started = Date.now();
      const timer = setInterval(() => {
        const offset = this.resumeOffsets.get(key);
        if (offset !== undefined) {
          clearInterval(timer);
          resolve(offset);
        } else if (Date.now() - started >= timeoutMs) {
          clearInterval(timer);
          resolve(0);
        }
      }, 50);
    });
  }

  private async handleChunk(msg: Extract<ShareControlMessage, { t: "file-chunk" }>): Promise<void> {
    if (this.cancelledTransfers.has(msg.transferId)) return;
    const buf = this.receiveBuffers.get(msg.fileId);
    if (!buf) return;
    buf.parts.set(msg.offset, base64ToArrayBuffer(msg.data));

    const received = [...buf.parts.values()].reduce((s, p) => s + p.byteLength, 0);
    const queue = this.inboundQueues.get(msg.transferId) ?? [];
    const item = queue.find((q) => q.id === msg.fileId);
    if (item) {
      item.status = "transferring";
      item.progress = Math.round((received / buf.size) * 100);
      this.callbacks.onInboundUpdate?.(msg.transferId, [...queue]);
    }

    await persistReceiveProgress({
      roomId: this.roomId,
      transferId: msg.transferId,
      fileId: msg.fileId,
      relativePath: buf.relativePath,
      size: buf.size,
      sha256: buf.sha256,
      parts: buf.parts,
      latestOffset: msg.offset,
      latestData: base64ToArrayBuffer(msg.data),
    });

    this.emitProgress(msg.transferId, msg.fileId, buf.relativePath, "in", received, buf.size, Date.now());
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
    const queue = this.inboundQueues.get(msg.transferId) ?? [];
    const item = queue.find((q) => q.id === msg.fileId);

    if (hash !== msg.sha256) {
      if (item) {
        item.status = "error";
        item.error = "SHA-256 не совпадает";
      }
      this.callbacks.onError?.(new Error(`Файл ${buf.relativePath}: контрольная сумма не совпадает`));
      this.receiveBuffers.delete(msg.fileId);
      this.callbacks.onInboundUpdate?.(msg.transferId, [...queue]);
      return;
    }

    const list = this.receivedByTransfer.get(msg.transferId) ?? [];
    list.push({ name: buf.relativePath, blob });
    this.receivedByTransfer.set(msg.transferId, list);

    if (item) {
      item.status = "done";
      item.progress = 100;
      if (blob.type.startsWith("image/")) {
        item.previewUrl = URL.createObjectURL(blob);
      }
    }
    this.receiveBuffers.delete(msg.fileId);
    await clearResumeState(this.roomId, msg.fileId);
    this.callbacks.onInboundUpdate?.(msg.transferId, [...queue]);

    const allDone = queue.length > 0 && queue.every((q) => q.status === "done" || q.status === "error");
    if (allDone) {
      await this.finalizeReceivedFiles(msg.transferId);
      this.callbacks.onTransferComplete?.("in", msg.transferId);
    }
  }

  private async finalizeReceivedFiles(transferId: string): Promise<void> {
    const files = this.receivedByTransfer.get(transferId) ?? [];
    if (!files.length) return;

    const asFolder = hasFolderStructure(
      files.map((f) => ({ file: new File([], f.name), relativePath: f.name })),
    );

    if (asFolder && files.length > 1) {
      const root = files[0]!.name.split("/")[0] ?? "qhub-share";
      await saveFilesAsZip(files, `${root}.zip`);
    } else if (files.length === 1) {
      await saveReceivedFile(files[0]!.blob, files[0]!.name);
    } else {
      for (const f of files) {
        await saveReceivedFile(f.blob, f.name);
      }
    }
    this.receivedByTransfer.delete(transferId);
  }

  private emitProgress(
    transferId: string,
    fileId: string,
    fileName: string,
    direction: "out" | "in",
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
      direction,
      bytesSent,
      bytesTotal,
      speedBps,
      etaSec,
    });
  }

  destroy(): void {
    this.unsub?.();
    for (const item of this.outboundQueue) {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    }
    for (const queue of this.inboundQueues.values()) {
      for (const item of queue) {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      }
    }
  }
}
