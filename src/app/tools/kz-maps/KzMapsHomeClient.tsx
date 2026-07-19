"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { KZ_PLACE_CATEGORY_LABELS } from "@/lib/kz-maps/constants";
import { getAllKzPlaces, getKzPlacesIndex } from "@/lib/kz-maps/places";
import type { KzPlace, KzPlaceCategory } from "@/lib/kz-maps/types";

const btnPrimary =
  "block w-full rounded-xl bg-emerald-700 text-white py-2.5 text-center text-sm font-semibold touch-manipulation active:opacity-90";
const btnSecondary =
  "block w-full rounded-xl border border-gray-200 bg-white text-gray-900 py-2.5 text-center text-sm font-medium touch-manipulation active:bg-gray-50";

function PlaceRow({ place }: { place: KzPlace }) {
  return (
    <li className="rounded-xl border border-gray-200 bg-white px-3 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">{place.name}</p>
          <p className="text-[11px] text-emerald-700 mt-0.5">
            {KZ_PLACE_CATEGORY_LABELS[place.category]}
          </p>
          <p className="text-xs text-gray-600 mt-1.5 leading-relaxed">{place.summary}</p>
          <p className="text-[10px] text-gray-400 mt-1 tabular-nums">
            {place.lat.toFixed(4)}, {place.lng.toFixed(4)}
          </p>
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          <Link
            href={`/tools/kz-maps/map?place=${encodeURIComponent(place.id)}`}
            className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-medium text-emerald-800 text-center"
          >
            Карта
          </Link>
          <Link
            href={`/tools/kz-maps/map?routeTo=${encodeURIComponent(place.id)}`}
            className="rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-[11px] font-medium text-sky-800 text-center"
          >
            Маршрут
          </Link>
        </div>
      </div>
    </li>
  );
}

export function KzMapsHomeClient() {
  const index = getKzPlacesIndex();
  const allPlaces = getAllKzPlaces();
  const [region, setRegion] = useState<string>("");
  const [category, setCategory] = useState<string>("");

  const filtered = useMemo(() => {
    let list = allPlaces;
    if (region) list = list.filter((p) => p.region === region);
    if (category) list = list.filter((p) => p.category === category);
    return list;
  }, [allPlaces, region, category]);

  return (
    <div className="min-h-[100dvh] bg-slate-100 flex flex-col">
      <header className="shrink-0 border-b border-gray-200 bg-white px-4 py-3">
        <div className="mx-auto max-w-lg flex items-center gap-3">
          <Link
            href="/"
            className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
            aria-label="На главную"
          >
            ←
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-semibold text-gray-900">KZ Maps</h1>
            <p className="text-xs text-gray-500">Карты, треки и места Казахстана</p>
          </div>
          <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
            beta
          </span>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-lg p-4 space-y-4 pb-8">
          <section className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <p className="font-medium">Карта, треки и маршруты</p>
            <p className="text-xs mt-1 text-emerald-800/90 leading-relaxed">
              Запись и импорт GPX, построение маршрута, офлайн-регионы и предложения мест.
            </p>
          </section>

          <section className="space-y-2">
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Карта</p>
            <Link href="/tools/kz-maps/map" className={btnPrimary}>
              Открыть карту
            </Link>
            <Link href="/tools/kz-maps/maps" className={btnSecondary}>
              Скачать офлайн-карты
            </Link>
            <Link href="/tools/kz-maps/places/suggest" className={btnSecondary}>
              Предложить место
            </Link>
            <Link href="/tools/kz-maps/map?routeTo=charyn-canyon" className={btnSecondary}>
              Пример маршрута (Чарын)
            </Link>
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                Красивые места · {filtered.length}
              </p>
            </div>

            <div className="flex gap-2">
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="flex-1 rounded-xl border border-gray-200 bg-white px-2 py-2 text-xs"
              >
                <option value="">Все регионы</option>
                {index.regions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="flex-1 rounded-xl border border-gray-200 bg-white px-2 py-2 text-xs"
              >
                <option value="">Все категории</option>
                {(Object.keys(KZ_PLACE_CATEGORY_LABELS) as KzPlaceCategory[]).map((id) => (
                  <option key={id} value={id}>
                    {KZ_PLACE_CATEGORY_LABELS[id]}
                  </option>
                ))}
              </select>
            </div>

            <ul className="space-y-2">
              {filtered.map((place) => (
                <PlaceRow key={place.id} place={place} />
              ))}
            </ul>
          </section>
        </div>
      </main>
    </div>
  );
}
