"use client";

import { useEffect, useRef, useState } from "react";

interface NameInputDialogProps {
  open: boolean;
  title: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}

export function NameInputDialog({
  open,
  title,
  initialValue = "",
  placeholder = "Название",
  confirmLabel = "Сохранить",
  onConfirm,
  onCancel,
}: NameInputDialogProps) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setValue(initialValue);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open, initialValue]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onConfirm(trimmed);
  };

  return (
    <div
      className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center bg-black/40 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
    >
      <form
        className="w-full max-w-sm rounded-2xl bg-white dark:bg-gray-900 p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{title}</p>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="mt-3 w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-violet-500/40"
        />
        <div className="mt-4 flex gap-2">
          <button
            type="submit"
            disabled={!value.trim()}
            className="flex-1 py-2 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-medium disabled:opacity-40"
          >
            {confirmLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium"
          >
            Отмена
          </button>
        </div>
      </form>
    </div>
  );
}
