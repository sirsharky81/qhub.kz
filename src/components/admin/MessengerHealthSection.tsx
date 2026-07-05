"use client";

import { useCallback, useEffect, useState } from "react";

interface MessengerEndpointHealth {
  endpoint: string;
  requestsLastMinute: number;
  requestsLast5Min: number;
  errorsLast5Min: number;
  rateLimitedLast5Min: number;
}

interface MessengerHealthSnapshot {
  generatedAt: number;
  totals: {
    requestsLastMinute: number;
    requestsLast5Min: number;
    errorsLast5Min: number;
    rateLimitedLast5Min: number;
  };
  endpoints: MessengerEndpointHealth[];
  guardrails: {
    roomMaxParticipants: number;
    maxDmEnvelopes: number;
    maxRoomEnvelopes: number;
    msgTtlHours: number;
    roomInactiveTtlHours: number;
  };
}

const REFRESH_MS = 20_000;

function endpointLabel(endpoint: string): string {
  switch (endpoint) {
    case "poll":
      return "poll";
    case "dialogs":
      return "dialogs";
    case "send":
      return "send";
    case "dialogs_read":
      return "dialogs/read";
    default:
      return endpoint;
  }
}

export function MessengerHealthSection() {
  const [snapshot, setSnapshot] = useState<MessengerHealthSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/messenger/health", { cache: "no-store" });
      if (!res.ok) throw new Error("load failed");
      const data = (await res.json()) as MessengerHealthSnapshot;
      setSnapshot(data);
      setError(null);
    } catch {
      setError("Не удалось загрузить статистику messenger");
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
          <h2 className="text-sm font-semibold text-gray-900">Messenger Health (Cost guardrails)</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Счётчики запросов за 1 и 5 минут. Автообновление: 20 сек.
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
        <p className="p-4 text-sm text-gray-500">Загрузка…</p>
      ) : error ? (
        <p className="p-4 text-sm text-red-700">{error}</p>
      ) : snapshot ? (
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard label="Req / 1м" value={snapshot.totals.requestsLastMinute} />
            <MetricCard label="Req / 5м" value={snapshot.totals.requestsLast5Min} />
            <MetricCard label="Ошибки / 5м" value={snapshot.totals.errorsLast5Min} />
            <MetricCard label="429 / 5м" value={snapshot.totals.rateLimitedLast5Min} />
          </div>

          <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-600">
            Guardrails: room participants ≤ {snapshot.guardrails.roomMaxParticipants}, DM envelopes ≤{" "}
            {snapshot.guardrails.maxDmEnvelopes}, room envelopes ≤ {snapshot.guardrails.maxRoomEnvelopes}, msg TTL{" "}
            {snapshot.guardrails.msgTtlHours}h, room inactive TTL {snapshot.guardrails.roomInactiveTtlHours}h.
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">
                  <th className="py-2 pr-3">Endpoint</th>
                  <th className="py-2 pr-3">Req/1м</th>
                  <th className="py-2 pr-3">Req/5м</th>
                  <th className="py-2 pr-3">Errors/5м</th>
                  <th className="py-2 pr-0">429/5м</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.endpoints.map((row) => (
                  <tr key={row.endpoint} className="border-b border-gray-50 last:border-b-0">
                    <td className="py-2 pr-3 font-mono text-gray-700">{endpointLabel(row.endpoint)}</td>
                    <td className="py-2 pr-3 text-gray-900">{row.requestsLastMinute}</td>
                    <td className="py-2 pr-3 text-gray-900">{row.requestsLast5Min}</td>
                    <td className="py-2 pr-3 text-gray-900">{row.errorsLast5Min}</td>
                    <td className="py-2 pr-0 text-gray-900">{row.rateLimitedLast5Min}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

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

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-gray-900">{value}</p>
    </div>
  );
}
