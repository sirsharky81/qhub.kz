"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { KzMapRegionBundle } from "@/lib/kz-maps/types";
import { formatBytes } from "@/lib/kz-maps/regions";
import {
  PROTOMAPS_ATTRIBUTION_HTML,
  PROTOMAPS_LICENSE_NOTE,
} from "@/lib/kz-maps/offline-map-source";
import {
  deleteAllOfflineRegions,
  deleteOfflineRegion,
  downloadRegionBundle,
  getOfflineStorageSummary,
  listOfflineRegions,
  type DownloadProgress,
  type OfflineRegionMeta,
} from "@/lib/kz-maps/offline-storage";

function formatDownloadedAt(ts: number): string {
  return new Date(ts).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function KzMapsDownloadClient() {
  const [bundles, setBundles] = useState<KzMapRegionBundle[]>([]);
  const [offline, setOffline] = useState<OfflineRegionMeta[]>([]);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshOffline = useCallback(() => {
    setOffline(listOfflineRegions());
  }, []);

  const storageSummary = useMemo(() => getOfflineStorageSummary(), [offline]);

  useEffect(() => {
    void fetch("/api/kz-maps/regions")
      .then((r) => r.json())
      .then((d: { bundles: KzMapRegionBundle[] }) => setBundles(d.bundles ?? []))
      .catch(() => setError("Не удалось загрузить список регионов"));
    refreshOffline();
  }, [refreshOffline]);

  async function handleDownload(bundle: KzMapRegionBundle) {
    setError(null);
    setProgress({ regionId: bundle.id, phase: "places", percent: 0, message: "Старт…" });
    try {
      await downloadRegionBundle(bundle, setProgress);
      refreshOffline();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
      setProgress(null);
    }
  }

  async function handleDelete(meta: OfflineRegionMeta) {
    const sizeHint = meta.pmtilesBytes ? ` (~${formatBytes(meta.pmtilesBytes)})` : "";
    const ok = window.confirm(
      `Удалить «${meta.name}» с этого устройства${sizeHint}?\n\nБудут удалены офлайн-карта и список мест региона.`,
    );
    if (!ok) return;

    await deleteOfflineRegion(meta.id);
    refreshOffline();
  }

  async function handleDeleteAll() {
    if (offline.length === 0) return;
    const ok = window.confirm(
      `Удалить все офлайн-карты (${offline.length}) с этого устройства?\n\nОсвободится примерно ${formatBytes(storageSummary.estimatedBytes)}.`,
    );
    if (!ok) return;

    await deleteAllOfflineRegions();
    refreshOffline();
  }

  const bundleById = useMemo(() => new Map(bundles.map((b) => [b.id, b])), [bundles]);

  return (
    <div className="min-h-[100dvh] bg-slate-100 flex flex-col">
      <header className="shrink-0 border-b border-gray-200 bg-white px-4 py-3">
        <div className="mx-auto max-w-lg flex items-center gap-3">
          <Link href="/tools/kz-maps" className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100" aria-label="Назад">
            ←
          </Link>
          <div>
            <h1 className="text-base font-semibold text-gray-900">Офлайн-карты</h1>
            <p className="text-xs text-gray-500">Скачивание и удаление с устройства</p>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto mx-auto max-w-lg w-full p-4 space-y-4 pb-8">
        <section className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs text-sky-900 leading-relaxed space-y-2">
          <p>
            Карта региона вырезается из открытого архива{" "}
            <strong>Protomaps / OpenStreetMap</strong> (лицензия ODbL) — не с собственного tile-сервера
            qhub.kz.
          </p>
          <p>
            На карте обязательна attribution:{" "}
            <span dangerouslySetInnerHTML={{ __html: PROTOMAPS_ATTRIBUTION_HTML }} />.
          </p>
          <p className="text-sky-800">{PROTOMAPS_LICENSE_NOTE}</p>
        </section>

        {offline.length > 0 && (
          <section className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-emerald-900">На устройстве</p>
                <p className="text-xs text-emerald-800 mt-0.5">
                  {storageSummary.regionCount} регион(ов) · {storageSummary.placesCount} мест ·{" "}
                  {storageSummary.pmtilesReadyCount} карт
                  {storageSummary.estimatedBytes > 0
                    ? ` · ~${formatBytes(storageSummary.estimatedBytes)}`
                    : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleDeleteAll()}
                className="shrink-0 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-red-700"
              >
                Удалить все
              </button>
            </div>
            <ul className="space-y-1.5">
              {offline.map((meta) => (
                <li
                  key={meta.id}
                  className="flex items-center justify-between gap-2 rounded-lg bg-white/70 px-2.5 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-900 truncate">{meta.name}</p>
                    <p className="text-[10px] text-gray-500">
                      {formatDownloadedAt(meta.downloadedAt)}
                      {meta.pmtilesReady ? " · карта ✓" : " · только места"}
                      {meta.pmtilesBytes ? ` · ~${formatBytes(meta.pmtilesBytes)}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleDelete(meta)}
                    className="shrink-0 rounded-md border border-red-200 px-2 py-1 text-[10px] font-semibold text-red-700"
                  >
                    Удалить
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {error && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>
        )}

        {progress && (
          <div className="rounded-xl border border-gray-200 bg-white p-3 text-sm">
            <p className="font-medium text-gray-900">{progress.message}</p>
            <div className="mt-2 h-2 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full bg-emerald-600 transition-all"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
          </div>
        )}

        <section className="space-y-2">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Доступные регионы</p>
          <ul className="space-y-2">
            {bundles.map((b) => {
              const local = offline.find((o) => o.id === b.id);
              return (
                <li key={b.id} className="rounded-xl border border-gray-200 bg-white p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{b.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {b.placesCount} мест
                        {b.pmtilesBytes ? ` · ~${formatBytes(b.pmtilesBytes)} карта` : ""}
                        {b.mapDataSource ? ` · ${b.mapDataSource}` : ""}
                      </p>
                      {local && (
                        <p className="text-[11px] text-emerald-700 mt-1">
                          На устройстве · {formatDownloadedAt(local.downloadedAt)}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={!!progress && progress.regionId === b.id && progress.phase !== "done"}
                        onClick={() => void handleDownload(b)}
                        className="rounded-lg bg-emerald-700 text-white px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                      >
                        {local ? "Обновить" : "Скачать"}
                      </button>
                      {local && (
                        <button
                          type="button"
                          onClick={() => void handleDelete(local)}
                          className="rounded-lg border border-red-200 text-red-700 px-3 py-1.5 text-xs"
                        >
                          Удалить
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {offline.some((meta) => !bundleById.has(meta.id)) && (
          <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            Есть скачанные регионы, которых больше нет в каталоге. Их можно удалить в блоке «На устройстве».
          </p>
        )}
      </main>
    </div>
  );
}
