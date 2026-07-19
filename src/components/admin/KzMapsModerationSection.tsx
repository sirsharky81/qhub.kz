"use client";

import { useCallback, useEffect, useState } from "react";
import { KZ_PLACE_CATEGORY_LABELS } from "@/lib/kz-maps/constants";
import type { PendingPlaceSuggestion } from "@/lib/kz-maps/pending-store";

export function KzMapsModerationSection() {
  const [items, setItems] = useState<PendingPlaceSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/kz-maps/pending");
      if (!res.ok) throw new Error("load failed");
      const data = (await res.json()) as { pending: PendingPlaceSuggestion[] };
      setItems(data.pending);
    } catch {
      setError("Не удалось загрузить заявки (нужен Redis)");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function moderate(id: string, action: "approve" | "reject") {
    setBusyId(id);
    try {
      const res = await fetch("/api/admin/kz-maps/pending", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      if (!res.ok) throw new Error("save failed");
      setItems((prev) => prev.filter((p) => p.id !== id));
    } catch {
      setError("Не удалось сохранить");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">KZ Maps — модерация мест</h2>
        <button type="button" onClick={() => void load()} className="text-xs text-gray-600 underline">
          Обновить
        </button>
      </div>
      {loading && <p className="p-4 text-sm text-gray-500">Загрузка…</p>}
      {error && <p className="p-4 text-sm text-red-600">{error}</p>}
      {!loading && items.length === 0 && !error && (
        <p className="p-4 text-sm text-gray-500">Нет заявок на модерацию</p>
      )}
      <ul className="divide-y divide-gray-100">
        {items.map((item) => (
          <li key={item.id} className="p-4 space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-gray-900">{item.name}</p>
                <p className="text-xs text-emerald-700">
                  {KZ_PLACE_CATEGORY_LABELS[item.category]} · {item.region}
                </p>
                <p className="text-xs text-gray-500 tabular-nums">
                  {item.lat.toFixed(5)}, {item.lng.toFixed(5)}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busyId === item.id}
                  onClick={() => void moderate(item.id, "approve")}
                  className="rounded-lg bg-emerald-600 text-white px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                >
                  Одобрить
                </button>
                <button
                  type="button"
                  disabled={busyId === item.id}
                  onClick={() => void moderate(item.id, "reject")}
                  className="rounded-lg border border-red-200 text-red-700 px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                >
                  Отклонить
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-700 leading-relaxed">{item.summary}</p>
            {(item.submitterName || item.submitterContact) && (
              <p className="text-[10px] text-gray-400">
                {item.submitterName}
                {item.submitterContact ? ` · ${item.submitterContact}` : ""}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
