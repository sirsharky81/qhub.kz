"use client";

import { useState } from "react";
import { MOBILE_SAFE_INPUT_CLASS } from "@/lib/platform/mobile-viewport";

interface Props {
  busy: boolean;
  onCreate: (pin?: string) => void;
}

const inputClass = `w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm ${MOBILE_SAFE_INPUT_CLASS}`;

export function ShareCreatePanel({ busy, onCreate }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [createPin, setCreatePin] = useState("");

  if (!expanded) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => setExpanded(true)}
        className="w-full rounded-xl border border-dashed border-gray-300 py-3 text-sm font-medium text-gray-600 active:bg-gray-50 disabled:opacity-50"
      >
        Создать новую комнату
      </button>
    );
  }

  return (
    <section className="rounded-2xl border border-gray-200 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-900">Новая комната</h2>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="text-xs text-gray-500"
        >
          Скрыть
        </button>
      </div>

      <label className="block">
        <span className="text-xs font-medium text-gray-600">PIN (необязательно)</span>
        <input
          value={createPin}
          onChange={(e) => setCreatePin(e.target.value.replace(/\D/g, "").slice(0, 8))}
          inputMode="numeric"
          placeholder="4–8 цифр"
          className={`mt-1 ${inputClass}`}
          disabled={busy}
        />
      </label>

      <button
        type="button"
        disabled={busy}
        onClick={() => onCreate(createPin || undefined)}
        className="w-full rounded-xl bg-sky-600 text-white py-3 text-sm font-semibold disabled:opacity-50 active:bg-sky-700"
      >
        {busy ? "Создание…" : "Создать комнату"}
      </button>
    </section>
  );
}
