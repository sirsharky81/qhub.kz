"use client";

import type { IncomingTransferOffer, TransferProgress, TransferQueueItem } from "@/lib/share/transfer-manager";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatSpeed(bps: number): string {
  return `${formatBytes(bps)}/с`;
}

function formatEta(sec: number | null): string {
  if (sec == null || !Number.isFinite(sec)) return "—";
  if (sec < 60) return `${Math.ceil(sec)} сек`;
  return `${Math.ceil(sec / 60)} мин`;
}

function QueueList({ items, emptyLabel }: { items: TransferQueueItem[]; emptyLabel: string }) {
  if (!items.length) return <p className="text-sm text-gray-400">{emptyLabel}</p>;
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.id} className="flex items-center gap-2 text-sm">
          {item.previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.previewUrl} alt="" className="h-10 w-10 rounded object-cover shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-xs">{item.relativePath}</p>
            <p className="text-[11px] text-gray-500">
              {item.status === "transferring" ? `${item.progress}%` : item.status}
              {item.error ? ` · ${item.error}` : ""}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

interface Props {
  outboundQueue: TransferQueueItem[];
  inboundOffers: IncomingTransferOffer[];
  inboundQueues: Map<string, TransferQueueItem[]>;
  progress: TransferProgress | null;
  onPickFiles: (files: FileList | File[]) => void;
  onPickFolder: () => void;
  onStartSend: () => void;
  onCancelOutbound: () => void;
  onCancelInbound: (transferId: string) => void;
  canSend: boolean;
  onAcceptIncoming: (transferId: string) => void;
  onRejectIncoming: (transferId: string) => void;
}

export function FileTransferPanel({
  outboundQueue,
  inboundOffers,
  inboundQueues,
  progress,
  onPickFiles,
  onPickFolder,
  onStartSend,
  onCancelOutbound,
  onCancelInbound,
  canSend,
  onAcceptIncoming,
  onRejectIncoming,
}: Props) {
  return (
    <div className="p-4 space-y-4">
      {inboundOffers.map((offer) => (
        <div key={offer.transferId} className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
          <p className="text-sm font-medium text-amber-900">
            Входящая передача: {offer.files.length} файл(ов)
          </p>
          <ul className="text-xs text-amber-900/80 space-y-0.5 max-h-24 overflow-y-auto">
            {offer.files.slice(0, 5).map((f) => (
              <li key={f.id} className="truncate font-mono">
                {f.relativePath ?? f.name}
              </li>
            ))}
            {offer.files.length > 5 && <li>…ещё {offer.files.length - 5}</li>}
          </ul>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onAcceptIncoming(offer.transferId)}
              className="flex-1 rounded-lg bg-emerald-600 text-white py-2 text-sm font-semibold"
            >
              Принять
            </button>
            <button
              type="button"
              onClick={() => onRejectIncoming(offer.transferId)}
              className="flex-1 rounded-lg border border-gray-300 py-2 text-sm"
            >
              Отклонить
            </button>
          </div>
        </div>
      ))}

      {[...inboundQueues.entries()].map(([transferId, items]) => (
        <div key={transferId} className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-emerald-900">Получение</p>
            <button
              type="button"
              onClick={() => onCancelInbound(transferId)}
              className="text-[11px] text-red-600"
            >
              Отмена
            </button>
          </div>
          <QueueList items={items} emptyLabel="Ожидание файлов…" />
        </div>
      ))}

      <div className="grid grid-cols-2 gap-2">
        <label className="block rounded-xl border-2 border-dashed border-gray-300 p-4 text-center cursor-pointer hover:border-sky-400 hover:bg-sky-50/30 transition-colors col-span-2 sm:col-span-1">
          <input
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) onPickFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <p className="text-sm font-medium text-gray-700">Файлы</p>
        </label>
        <button
          type="button"
          onClick={onPickFolder}
          className="rounded-xl border-2 border-dashed border-gray-300 p-4 text-center hover:border-sky-400 hover:bg-sky-50/30"
        >
          <p className="text-sm font-medium text-gray-700">Папка</p>
        </button>
      </div>

      <div
        className="rounded-xl border border-gray-200 p-3"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files.length) onPickFiles(e.dataTransfer.files);
        }}
      >
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-gray-500">Отправка</p>
          <button type="button" onClick={onCancelOutbound} className="text-[11px] text-red-600">
            Отмена
          </button>
        </div>
        <QueueList items={outboundQueue} emptyLabel="Файлы не выбраны" />
      </div>

      {progress && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-1">
          <p className="text-[11px] text-gray-500">
            {progress.direction === "out" ? "Отправка" : "Получение"}
          </p>
          <p className="text-sm font-medium truncate">{progress.fileName}</p>
          <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
            <div
              className="h-full bg-sky-500 transition-all"
              style={{ width: `${Math.min(100, (progress.bytesSent / progress.bytesTotal) * 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-[11px] text-gray-500">
            <span>
              {formatBytes(progress.bytesSent)} / {formatBytes(progress.bytesTotal)}
            </span>
            <span>{formatSpeed(progress.speedBps)}</span>
            <span>~{formatEta(progress.etaSec)}</span>
          </div>
        </div>
      )}

      <button
        type="button"
        disabled={!canSend || !outboundQueue.some((q) => q.status === "pending")}
        onClick={onStartSend}
        className="w-full rounded-xl bg-sky-600 text-white py-2.5 text-sm font-semibold disabled:opacity-40"
      >
        Отправить
      </button>
    </div>
  );
}
