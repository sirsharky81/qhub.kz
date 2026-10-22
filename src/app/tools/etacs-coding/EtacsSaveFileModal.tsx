"use client";

import { useEffect, useRef, useState } from "react";
import { PickerButton } from "../random-picker/components/PickerButton";
import {
  canUseSaveFilePicker,
  cleanCodingFileStem,
  detectCodingExtension,
} from "./etacs-backup";

export type SaveDialogMethod = "picker" | "download" | "share" | "overwrite";

export interface EtacsSaveFileDialogRequest {
  side: "a" | "b";
  mode: "edited" | "original";
  originalDisplayName: string;
  vin?: string;
  ecuId?: string;
  hasFileHandle?: boolean;
  canShareFiles?: boolean;
  onConfirm: (finalFileName: string, method: SaveDialogMethod) => Promise<void>;
}

interface Props {
  request: EtacsSaveFileDialogRequest | null;
  onClose: () => void;
}

function makeTimestampTag(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

export function EtacsSaveFileModal({ request, onClose }: Props) {
  if (!request) return null;
  return (
    <EtacsSaveFileModalInner
      key={`${request.side}-${request.mode}-${request.originalDisplayName}`}
      request={request}
      onClose={onClose}
    />
  );
}

function EtacsSaveFileModalInner({
  request,
  onClose,
}: {
  request: EtacsSaveFileDialogRequest;
  onClose: () => void;
}) {
  const baseStem = cleanCodingFileStem(
    request.originalDisplayName,
    [request.ecuId, request.vin].filter(Boolean).join("_") || `file_${request.side}`,
  );
  const [stem, setStem] = useState(() =>
    request.mode === "original"
      ? `${baseStem}_orig_${makeTimestampTag()}`
      : `${baseStem}_mod_${makeTimestampTag()}`,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supportsPicker] = useState(() => canUseSaveFilePicker());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 30);
    return () => window.clearTimeout(timer);
  }, []);

  const ext = detectCodingExtension(request.originalDisplayName);
  const cleanedUserInput = stem
    .replace(/\.(kon|cuf).*$/i, "")
    .replace(/[^\w.\-()+\u0400-\u04FF ]+/g, "_")
    .replace(/[\s._-]+$/g, "")
    .trim();
  const finalPreview = `${cleanedUserInput || baseStem}${ext}`;

  const applyPreset = (kind: "base" | "orig" | "mod" | "date") => {
    const ts = makeTimestampTag();
    if (kind === "base") setStem(baseStem);
    else if (kind === "orig") setStem(`${baseStem}_orig`);
    else if (kind === "mod") setStem(`${baseStem}_mod_${ts}`);
    else if (kind === "date") setStem(`${baseStem}_${ts}`);
    inputRef.current?.focus();
  };

  const handleConfirm = async (method: SaveDialogMethod) => {
    setBusy(true);
    setError(null);
    try {
      await request.onConfirm(finalPreview, method);
      onClose();
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") {
        setBusy(false);
        return;
      }
      setError(err instanceof Error ? err.message : "Не удалось сохранить файл");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="w-full max-w-md rounded-t-2xl border border-gray-200 bg-white p-4 shadow-2xl sm:rounded-2xl sm:p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 border-b border-gray-100 pb-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              {request.mode === "original"
                ? `Сохранить оригинал (Файл ${request.side.toUpperCase()})`
                : `Сохранить изменённый файл ${request.side.toUpperCase()}`}
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Задайте название файла и выберите, куда его сохранить. Расширение{" "}
              <code className="rounded bg-gray-100 px-1 font-mono font-semibold text-gray-800">
                {ext}
              </code>{" "}
              всегда ставится строго в конце, чтобы файл корректно читался в MMCodingWriter и MUT-III.
            </p>
          </div>
          <PickerButton variant="ghost" onClick={onClose} disabled={busy} ariaLabel="Закрыть">
            ✕
          </PickerButton>
        </div>

        <div className="mt-3.5 space-y-3">
          <div>
            <label
              htmlFor="etacs-save-filename"
              className="block text-xs font-medium text-gray-700"
            >
              Имя файла (можно стереть или дописать заметку)
            </label>
            <div className="mt-1 flex items-stretch rounded-xl border border-gray-300 bg-white focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-500/20">
              <input
                ref={inputRef}
                id="etacs-save-filename"
                type="text"
                value={stem}
                disabled={busy}
                onChange={(e) => {
                  const cleaned = e.target.value.replace(/\.(kon|cuf)$/i, "");
                  setStem(cleaned);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleConfirm(supportsPicker ? "picker" : "download");
                  }
                }}
                placeholder={baseStem}
                className="min-w-0 flex-1 rounded-l-xl bg-transparent px-3 py-2 font-mono text-xs text-gray-900 focus:outline-none sm:text-sm"
              />
              {stem ? (
                <button
                  type="button"
                  onClick={() => {
                    setStem("");
                    inputRef.current?.focus();
                  }}
                  title="Очистить название"
                  className="px-2 text-xs text-gray-400 hover:text-gray-700"
                >
                  ✕
                </button>
              ) : null}
              <span className="inline-flex select-none items-center rounded-r-xl border-l border-gray-200 bg-gray-100 px-3 font-mono text-xs font-bold text-gray-800 sm:text-sm">
                {ext}
              </span>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-gray-400">Шаблоны:</span>
              <button
                type="button"
                onClick={() => applyPreset("base")}
                className="rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] text-gray-700 hover:bg-gray-100"
              >
                Исходное имя
              </button>
              <button
                type="button"
                onClick={() => applyPreset("orig")}
                className="rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] text-gray-700 hover:bg-gray-100"
              >
                + _orig
              </button>
              <button
                type="button"
                onClick={() => applyPreset("mod")}
                className="rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] text-gray-700 hover:bg-gray-100"
              >
                + _mod_дата
              </button>
              <button
                type="button"
                onClick={() => applyPreset("date")}
                className="rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] text-gray-700 hover:bg-gray-100"
              >
                + _дата
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs text-emerald-950">
            <span className="text-emerald-700">Итоговый файл: </span>
            <strong className="break-all font-mono">{finalPreview}</strong>
          </div>

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              {error}
            </div>
          ) : null}

          <div className="space-y-2 pt-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              Куда сохранить
            </p>

            {supportsPicker ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleConfirm("picker")}
                className="flex w-full items-center justify-between rounded-xl border border-gray-900 bg-gray-900 px-3.5 py-2.5 text-left text-xs font-semibold text-white shadow-sm transition hover:bg-gray-800 disabled:opacity-50"
              >
                <span>Выбрать папку на устройстве (Сохранить как…)</span>
                <span className="ml-2 rounded bg-white/15 px-1.5 py-0.5 font-mono text-[10px]">
                  Папка
                </span>
              </button>
            ) : null}

            <button
              type="button"
              disabled={busy}
              onClick={() => void handleConfirm("download")}
              className={`flex w-full items-center justify-between rounded-xl border px-3.5 py-2.5 text-left text-xs font-semibold transition disabled:opacity-50 ${
                supportsPicker
                  ? "border-gray-200 bg-white text-gray-900 hover:bg-gray-50"
                  : "border-gray-900 bg-gray-900 text-white shadow-sm hover:bg-gray-800"
              }`}
            >
              <span>Скачать файл в «Загрузки» браузера</span>
              <span
                className={`ml-2 rounded px-1.5 py-0.5 font-mono text-[10px] ${
                  supportsPicker ? "bg-gray-100 text-gray-700" : "bg-white/15 text-white"
                }`}
              >
                {ext}
              </span>
            </button>

            {request.canShareFiles ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleConfirm("share")}
                className="flex w-full items-center justify-between rounded-xl border border-blue-200 bg-blue-50/80 px-3.5 py-2.5 text-left text-xs font-semibold text-blue-900 transition hover:bg-blue-100 disabled:opacity-50"
              >
                <span>Выбрать место («Сохранить в Файлы» / Поделиться)</span>
                <span className="ml-2 rounded bg-blue-200/60 px-1.5 py-0.5 font-mono text-[10px] text-blue-900">
                  iOS / Android
                </span>
              </button>
            ) : null}

            {request.mode === "edited" && request.hasFileHandle ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleConfirm("overwrite")}
                className="flex w-full items-center justify-between rounded-xl border border-amber-200 bg-amber-50/80 px-3.5 py-2 text-left text-xs font-medium text-amber-950 transition hover:bg-amber-100 disabled:opacity-50"
              >
                <span>Перезаписать исходный открытый файл на месте</span>
                <span className="ml-2 font-mono text-[10px] text-amber-800">Замена</span>
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
