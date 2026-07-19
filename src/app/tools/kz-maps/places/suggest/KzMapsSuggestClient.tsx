"use client";

import Link from "next/link";
import { useState } from "react";
import { KZ_PLACE_CATEGORY_LABELS } from "@/lib/kz-maps/constants";
import { getKzPlacesIndex } from "@/lib/kz-maps/places";
import type { KzPlaceCategory } from "@/lib/kz-maps/types";

export function KzMapsSuggestClient() {
  const index = getKzPlacesIndex();
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [region, setRegion] = useState("");
  const [category, setCategory] = useState<KzPlaceCategory>("viewpoint");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [submitterName, setSubmitterName] = useState("");
  const [submitterContact, setSubmitterContact] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/kz-maps/places/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          summary,
          region,
          category,
          lat: Number(lat),
          lng: Number(lng),
          submitterName,
          submitterContact,
        }),
      });
      const data = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) throw new Error(data.error ?? "Ошибка отправки");
      setMessage(data.message ?? "Отправлено на модерацию");
      setName("");
      setSummary("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[100dvh] bg-slate-100 flex flex-col">
      <header className="shrink-0 border-b border-gray-200 bg-white px-4 py-3">
        <div className="mx-auto max-w-lg flex items-center gap-3">
          <Link href="/tools/kz-maps" className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100" aria-label="Назад">
            ←
          </Link>
          <div>
            <h1 className="text-base font-semibold text-gray-900">Предложить место</h1>
            <p className="text-xs text-gray-500">После проверки появится в каталоге</p>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto mx-auto max-w-lg w-full p-4 pb-8">
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Название места"
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            required
          />
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Описание (как добраться, что посмотреть…)"
            rows={4}
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            required
          />
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            required
          >
            <option value="">Регион</option>
            {index.regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as KzPlaceCategory)}
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
          >
            {(Object.keys(KZ_PLACE_CATEGORY_LABELS) as KzPlaceCategory[]).map((id) => (
              <option key={id} value={id}>
                {KZ_PLACE_CATEGORY_LABELS[id]}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <input
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              placeholder="Широта"
              className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm tabular-nums"
              required
            />
            <input
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              placeholder="Долгота"
              className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm tabular-nums"
              required
            />
          </div>
          <input
            value={submitterName}
            onChange={(e) => setSubmitterName(e.target.value)}
            placeholder="Ваше имя (необязательно)"
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
          />
          <input
            value={submitterContact}
            onChange={(e) => setSubmitterContact(e.target.value)}
            placeholder="Контакт (Telegram, email…)"
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-emerald-700 text-white py-2.5 text-sm font-semibold disabled:opacity-50"
          >
            {loading ? "Отправка…" : "Отправить на модерацию"}
          </button>
          {message && <p className="text-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">{message}</p>}
          {error && <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        </form>
      </main>
    </div>
  );
}
