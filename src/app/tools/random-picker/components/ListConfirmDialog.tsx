"use client";

import { PickerButton } from "./PickerButton";

export type ListConfirmKind = "import" | "newList";

interface ListConfirmDialogProps {
  kind: ListConfirmKind;
  participantCount: number;
  clearEvent: boolean;
  onClearEventChange: (v: boolean) => void;
  onDownload: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ListConfirmDialog({
  kind,
  participantCount,
  clearEvent,
  onClearEventChange,
  onDownload,
  onConfirm,
  onCancel,
}: ListConfirmDialogProps) {
  const title = kind === "import" ? "Заменить список?" : "Новый список?";
  const message =
    kind === "import"
      ? `Текущий список (${participantCount} участников) будет заменён содержимым файла.`
      : `Текущий список (${participantCount} участников) будет удалён. История операций сохранится.`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="list-confirm-title"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 space-y-3 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h4 id="list-confirm-title" className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {title}
        </h4>
        <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">{message}</p>

        {kind === "newList" && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={clearEvent}
              onChange={(e) => onClearEventChange(e.target.checked)}
              className="rounded"
            />
            <span className="text-xs text-gray-600 dark:text-gray-400">Также очистить поля мероприятия</span>
          </label>
        )}

        <div className="flex flex-col gap-2 pt-1">
          <PickerButton variant="secondary" onClick={onDownload} className="w-full">
            {kind === "import" ? "Скачать и заменить" : "Скачать и очистить"}
          </PickerButton>
          <PickerButton onClick={onConfirm} className="w-full">
            {kind === "import" ? "Заменить" : "Очистить"}
          </PickerButton>
          <PickerButton variant="ghost" onClick={onCancel} className="w-full">
            Отмена
          </PickerButton>
        </div>
      </div>
    </div>
  );
}
