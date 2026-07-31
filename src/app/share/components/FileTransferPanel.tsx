"use client";

import type { TransferProgress, TransferQueueItem } from "@/lib/share/transfer-manager";

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

interface Props {
  queue: TransferQueueItem[];
  progress: TransferProgress | null;
  onPickFiles: (files: FileList | File[]) => void;
  onStartSend: () => void;
  onCancel: () => void;
  canSend: boolean;
  incomingOffer: { transferId: string; fileCount: number } | null;
  onAcceptIncoming: () => void;
  onRejectIncoming: () => void;
}

export function FileTransferPanel({
  queue,
  progress,
  onPickFiles,
  onStartSend,
  onCancel,
  canSend,
  incomingOffer,
  onAcceptIncoming,
  onRejectIncoming,
}: Props) {
  return (
    <div className="p-4 space-y-4">
      {incomingOffer && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
          <p className="text-sm font-medium text-amber-900">
            Входящая передача: {incomingOffer.fileCount} файл(ов)
          </p>
          <p className="text-xs text-amber-800">Подтвердите получение перед началом загрузки.</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onAcceptIncoming}
              className="flex-1 rounded-lg bg-emerald-600 text-white py-2 text-sm font-semibold"
            >
              Принять
            </button>
            <button
              type="button"
              onClick={onRejectIncoming}
              className="flex-1 rounded-lg border border-gray-300 py-2 text-sm"
            >
              Отклонить
            </button>
          </div>
        </div>
      )}

      <label className="block rounded-xl border-2 border-dashed border-gray-300 p-6 text-center cursor-pointer hover:border-sky-400 hover:bg-sky-50/30 transition-colors">
        <input
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) onPickFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <p className="text-sm font-medium text-gray-700">Выберите файлы</p>
        <p className="text-xs text-gray-500 mt-1">или перетащите сюда · до 1 ГБ за сессию</p>
      </label>

      <div
        className="rounded-xl border border-gray-200 p-3 min-h-[80px]"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files.length) onPickFiles(e.dataTransfer.files);
        }}
      >
        <p className="text-xs font-medium text-gray-500 mb-2">Очередь</p>
        {queue.length === 0 ? (
          <p className="text-sm text-gray-400">Файлы не выбраны</p>
        ) : (
          <ul className="space-y-1.5">
            {queue.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate min-w-0">{item.file.name || "Файл"}</span>
                <span className="shrink-0 text-xs text-gray-500">
                  {item.status === "transferring" ? `${item.progress}%` : item.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {progress && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-1">
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

      <div className="flex gap-2">
        <button
          type="button"
          disabled={!canSend || queue.length === 0}
          onClick={onStartSend}
          className="flex-1 rounded-xl bg-sky-600 text-white py-2.5 text-sm font-semibold disabled:opacity-40"
        >
          Отправить
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm"
        >
          Отмена
        </button>
      </div>
    </div>
  );
}
