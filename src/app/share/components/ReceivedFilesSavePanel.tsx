"use client";

import type { ReceivedShareFile } from "@/lib/share/save-received";

interface Props {
  files: ReceivedShareFile[];
  saving: boolean;
  onSave: () => void;
  onDismiss?: () => void;
}

export function ReceivedFilesSavePanel({ files, saving, onSave, onDismiss }: Props) {
  if (!files.length) return null;

  const mediaCount = files.length;
  const label =
    mediaCount === 1
      ? "Сохранить в Фото"
      : `Сохранить в Фото (${mediaCount})`;

  return (
    <div className="mx-4 mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 space-y-2">
      <p className="text-sm font-medium text-emerald-900">
        Файлы получены — на iPhone нужно подтвердить сохранение
      </p>
      <p className="text-xs text-emerald-800/80">
        Нажмите кнопку ниже, затем в меню «Поделиться» выберите «Сохранить изображение» или «Add to
        Photos».
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {saving ? "Открываем…" : label}
        </button>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            disabled={saving}
            className="rounded-lg border border-emerald-300 px-3 py-2 text-sm text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
          >
            Позже
          </button>
        )}
      </div>
    </div>
  );
}
