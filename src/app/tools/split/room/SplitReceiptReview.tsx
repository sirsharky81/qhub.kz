"use client";

import { useState } from "react";
import { DEFAULT_CATEGORIES, SUPPORTED_CURRENCIES } from "@/lib/split/constants";
import { MOBILE_SAFE_INPUT_CLASS } from "@/lib/platform/mobile-viewport";
import type { ReceiptScanPayload } from "@/lib/split/receipt/types";

const inputClass = `w-full rounded-xl border border-emerald-900/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-teal-700 ${MOBILE_SAFE_INPUT_CLASS}`;

interface Props {
  draft: ReceiptScanPayload;
  baseCurrency: string;
  pending: boolean;
  onRetake: () => void;
  onCancel: () => void;
  onSave: (values: {
    amount: string;
    description: string;
    categoryId: string;
    currency: string;
  }) => void;
}

export function SplitReceiptReview({
  draft,
  baseCurrency,
  pending,
  onRetake,
  onCancel,
  onSave,
}: Props) {
  const [amount, setAmount] = useState(draft.amount);
  const [description, setDescription] = useState(draft.description ?? "");
  const [categoryId, setCategoryId] = useState(draft.categoryId ?? "other");
  const [currency, setCurrency] = useState(draft.currency ?? baseCurrency);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-emerald-950/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-4 space-y-3 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-emerald-950">Проверьте данные</h3>
          <span className="text-[10px] uppercase tracking-wide text-teal-800 bg-teal-50 px-2 py-0.5 rounded-full">
            С фото чека
          </span>
        </div>

        {draft.confidence === "low" && (
          <p className="text-xs text-amber-800 bg-amber-50 rounded-lg px-3 py-2">
            Сумма распознана неточно — проверьте вручную.
          </p>
        )}

        {!amount && (
          <p className="text-xs text-rose-700 bg-rose-50 rounded-lg px-3 py-2">
            Не нашли ИТОГО на чеке. Введите сумму вручную или переснимите нижнюю часть чека.
          </p>
        )}

        <label className="block space-y-1">
          <span className="text-xs text-emerald-950/60">Сумма</span>
          <input
            className={inputClass}
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-emerald-950/60">Валюта</span>
          <select className={inputClass} value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {SUPPORTED_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-emerald-950/60">Описание</span>
          <input
            className={inputClass}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-emerald-950/60">Категория</span>
          <select className={inputClass} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {DEFAULT_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.labelRu}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-col gap-2 pt-1">
          <button
            type="button"
            disabled={pending || !amount.trim() || Number(amount) <= 0}
            className="w-full rounded-xl bg-teal-800 text-white py-3 text-sm font-medium disabled:opacity-60"
            onClick={() =>
              onSave({
                amount: Number(amount).toFixed(2),
                description: description.trim() || "Расход",
                categoryId,
                currency: currency.trim() || baseCurrency,
              })
            }
          >
            {pending ? "Сохраняем…" : "Сохранить расход"}
          </button>
          <button
            type="button"
            disabled={pending}
            className="w-full rounded-xl border border-emerald-900/15 py-2.5 text-sm text-emerald-950/70"
            onClick={onRetake}
          >
            Переснять
          </button>
          <button
            type="button"
            disabled={pending}
            className="w-full text-xs text-emerald-950/45 py-1"
            onClick={onCancel}
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
