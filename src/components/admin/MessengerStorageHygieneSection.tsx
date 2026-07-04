"use client";

import { useCallback, useEffect, useState } from "react";

interface MessengerHygieneSnapshot {
  generatedAt: number;
  config: {
    messageTtlHours: number;
    roomInactiveTtlHours: number;
    maxDmEnvelopes: number;
    maxRoomEnvelopes: number;
    callTtlSec: number;
    presenceTtlSec: number;
    pushSubscriptionTtlDays: number;
  };
  warnings: string[];
}

const REFRESH_MS = 60_000;

export function MessengerStorageHygieneSection() {
  const [snapshot, setSnapshot] = useState<MessengerHygieneSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/messenger/hygiene", { cache: "no-store" });
      if (!res.ok) throw new Error("load failed");
      const data = (await res.json()) as MessengerHygieneSnapshot;
      setSnapshot(data);
      setError(null);
    } catch {
      setError("Не удалось загрузить Storage hygiene");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      void load();
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  return (
    <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Messenger Storage hygiene</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Проверка TTL и лимитов хранения (Hobby-safe профиль).
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          Обновить
        </button>
      </div>

      {loading ? (
        <p className="p-4 text-sm text-gray-500">Загрузка...</p>
      ) : error ? (
        <p className="p-4 text-sm text-red-700">{error}</p>
      ) : snapshot ? (
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <Kv label="Msg TTL" value={`${snapshot.config.messageTtlHours}h`} />
            <Kv label="Room inactive TTL" value={`${snapshot.config.roomInactiveTtlHours}h`} />
            <Kv label="DM envelopes cap" value={String(snapshot.config.maxDmEnvelopes)} />
            <Kv label="Room envelopes cap" value={String(snapshot.config.maxRoomEnvelopes)} />
            <Kv label="Call TTL" value={`${snapshot.config.callTtlSec}s`} />
            <Kv label="Presence TTL" value={`${snapshot.config.presenceTtlSec}s`} />
            <Kv label="Push subs TTL" value={`${snapshot.config.pushSubscriptionTtlDays}d`} />
          </div>

          {snapshot.warnings.length > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">
                Предупреждения
              </p>
              <ul className="mt-2 space-y-1 text-sm text-amber-900 list-disc pl-5">
                {snapshot.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              Конфигурация выглядит безопасной по объему хранения.
            </div>
          )}

          <p className="text-xs text-gray-400">
            Обновлено: {new Date(snapshot.generatedAt).toLocaleString()}
          </p>
        </div>
      ) : (
        <p className="p-4 text-sm text-gray-500">Нет данных</p>
      )}
    </section>
  );
}

function Kv({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-gray-900">{value}</p>
    </div>
  );
}
