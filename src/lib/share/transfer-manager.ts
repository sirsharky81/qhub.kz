import { MAX_SESSION_BYTES } from "./constants";
import type { PickedShareFile } from "./pick-files";
import { hasFolderStructure } from "./pick-files";
import { saveFilesAsZip, saveReceivedFile } from "./save-received";
import { sha256Hex } from "./sha256";
import {
  clearResumeState,
  computeContiguousOffset,
  loadResumeState,
  loadSavedChunks,
  persistReceiveProgress,
} from "./transfer-resume";
import {
  CHUNK_SIZE,
  MAX_DC_JSON_MESSAGE_LENGTH,
  arrayBufferToBase64,
  base64ToArrayBuffer,
  decodeControlMessage,
  encodeControlMessage,
  type ShareControlMessage,
  type ShareFileMeta,
} from "./transfer-protocol";
import type { SharePeerConnection } from "./webrtc-session";
import { detectTextKind, MAX_TEXT_BYTES, type ShareTextKind, utf8ByteLength } from "./text-utils";

export interface ShareTextMessage {
  id: string;
  body: string;
  direction: "out" | "in";
  sentAt: number;
  kind: ShareTextKind;
}

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
  onTextUpdate?: (messages: ShareTextMessage[]) => void;
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
  private textMessages: ShareTextMessage[] = [];
  private pendingFileAcks = new Map<string, { resolve: () => void; reject: (err: Error) => void }>();

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

  getTextMessages(): ShareTextMessage[] {
    return [...this.textMessages];
  }

  sendText(body: string): void {
    if (!this.peer.isConnected()) {
      this.callbacks.onError?.(new Error("Нет соединения с собеседником"));
      return;
    }

    const trimmed = body.trim();
    if (!trimmed) return;

    if (utf8ByteLength(trimmed) > MAX_TEXT_BYTES) {
      this.callbacks.onError?.(new Error("Текст слишком длинный (макс. 64 КБ)"));
      return;
    }

    const messageId = crypto.randomUUID();
    const kind = detectTextKind(trimmed);
    this.peer.send(encodeControlMessage({ t: "text-send", messageId, body: trimmed, kind }));
    this.textMessages.push({
      id: messageId,
      body: trimmed,
      direction: "out",
      sentAt: Date.now(),
      kind,
    });
    this.callbacks.onTextUpdate?.([...this.textMessages]);
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
        this.rejectFileAck(msg.transferId, msg.fileId, new Error(msg.reason));
        this.markOutboundError(msg.transferId, msg.fileId, msg.reason);
        this.callbacks.onError?.(new Error(msg.reason));
        break;
      case "file-ack":
        this.resolveFileAck(msg.transferId, msg.fileId);
        break;
      case "text-send":
        if (this.textMessages.some((m) => m.id === msg.messageId)) break;
        this.textMessages.push({
          id: msg.messageId,
          body: msg.body,
          direction: "in",
          sentAt: Date.now(),
          kind: msg.kind ?? detectTextKind(msg.body),
        });
        this.callbacks.onTextUpdate?.([...this.textMessages]);
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

      try {
        item.status = "transferring";
        item.progress = 0;
        item.error = undefined;
        this.callbacks.onOutboundUpdate?.([...this.outboundQueue]);

        const sha256 = await sha256Hex(item.file);
        const pathName = item.relativePath;
        await this.sendControlMessage({
          t: "file-start",
          transferId,
          fileId: item.id,
          name: pathName,
          size: item.file.size,
          sha256,
        });

        let offset = await this.waitForResumeOffset(transferId, item.id);
        const started = Date.now();
        while (offset < item.file.size && !this.cancelledTransfers.has(transferId)) {
          const chunk = item.file.slice(offset, offset + CHUNK_SIZE);
          const buffer = await chunk.arrayBuffer();
          await this.sendControlMessage({
            t: "file-chunk",
            transferId,
            fileId: item.id,
            offset,
            data: arrayBufferToBase64(buffer),
          });
          offset += buffer.byteLength;
          item.progress = Math.round((offset / item.file.size) * 100);
          this.callbacks.onOutboundUpdate?.([...this.outboundQueue]);
          this.emitProgress(transferId, item.id, pathName, "out", offset, item.file.size, started);
        }

        if (this.cancelledTransfers.has(transferId)) {
          item.status = "cancelled";
          break;
        }

        await this.sendControlMessage({
          t: "file-done",
          transferId,
          fileId: item.id,
          sha256,
        });
        await this.waitForFileAck(transferId, item.id);
        item.status = "done";
        item.progress = 100;
        this.callbacks.onOutboundUpdate?.([...this.outboundQueue]);
      } catch (err) {
        item.status = "error";
        item.error = err instanceof Error ? err.message : "Ошибка отправки";
        this.callbacks.onOutboundUpdate?.([...this.outboundQueue]);
        this.callbacks.onError?.(err instanceof Error ? err : new Error(String(err)));
        break;
      }
    }
    this.sendingTransfers.delete(transferId);
    this.callbacks.onTransferComplete?.("out", transferId);
  }

  private async sendControlMessage(msg: ShareControlMessage): Promise<void> {
    const raw = encodeControlMessage(msg);
    if (raw.length > MAX_DC_JSON_MESSAGE_LENGTH) {
      throw new Error("chunk_too_large_for_webrtc");
    }
    await this.peer.sendReliable(raw);
  }

  private fileAckKey(transferId: string, fileId: string): string {
    return `${transferId}:${fileId}`;
  }

  private waitForFileAck(transferId: string, fileId: string, timeoutMs = 120_000): Promise<void> {
    const key = this.fileAckKey(transferId, fileId);
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pendingFileAcks.delete(key);
        reject(new Error("Получатель не подтвердил файл"));
      }, timeoutMs);
      this.pendingFileAcks.set(key, {
        resolve: () => {
          window.clearTimeout(timer);
          this.pendingFileAcks.delete(key);
          resolve();
        },
        reject: (err) => {
          window.clearTimeout(timer);
          this.pendingFileAcks.delete(key);
          reject(err);
        },
      });
    });
  }

  private resolveFileAck(transferId: string, fileId: string): void {
    this.pendingFileAcks.get(this.fileAckKey(transferId, fileId))?.resolve();
  }

  private rejectFileAck(transferId: string, fileId: string, err: Error): void {
    this.pendingFileAcks.get(this.fileAckKey(transferId, fileId))?.reject(err);
  }

  private markOutboundError(transferId: string, fileId: string, reason: string): void {
    const item = this.outboundQueue.find((q) => q.transferId === transferId && q.id === fileId);
    if (item) {
      item.status = "error";
      item.error = reason;
      this.callbacks.onOutboundUpdate?.([...this.outboundQueue]);
    }
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

    const received = computeContiguousOffset(buf.parts, buf.size);
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
      this.peer.send(
        encodeControlMessage({
          t: "file-error",
          transferId: msg.transferId,
          fileId: msg.fileId,
          reason: "checksum_mismatch",
        }),
      );
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
    this.peer.send(
      encodeControlMessage({ t: "file-ack", transferId: msg.transferId, fileId: msg.fileId }),
    );

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
    void startedAt;
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
