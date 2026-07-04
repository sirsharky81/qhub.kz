"use client";

import { useCallback, useEffect, useState } from "react";
import type { MessengerPushDiagnosticsSnapshot } from "@/lib/messenger/push-diagnostics";

export function MessengerPushDiagnosticsSection() {
  const [data, setData] = useState<MessengerPushDiagnosticsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/admin/messenger/push-diagnostics");
      if (res.status === 401) {
        setError("Требуется вход администратора");
        return;
      }
      if (!res.ok) throw new Error("load failed");
      const json = (await res.json()) as MessengerPushDiagnosticsSnapshot;
      setData(json);
    } catch {
      setError("Не удалось загрузить Push Diagnostics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 20_000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
        <h2 className="text-sm font-semibold text-gray-900">Messenger Push Diagnostics</h2>
        <p className="text-xs text-gray-500 mt-1">
          Подписки по whitelist-пользователям и базовая диагностика FCM/WebPush.
        </p>
      </div>

      {loading ? (
        <p className="p-4 text-sm text-gray-500">Загрузка…</p>
      ) : error ? (
        <p className="p-4 text-sm text-red-700 bg-red-50 border-t border-red-100">{error}</p>
      ) : data ? (
        <div className="p-4 space-y-4">
          <p className="text-[11px] text-gray-500">
            Обновлено: {new Date(data.generatedAt).toLocaleString()}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Активных в whitelist" value={data.activeWhitelistPhones} />
            <Stat label="С подпиской" value={data.phonesWithAnySubscription} />
            <Stat label="Без подписки" value={data.phonesWithoutSubscriptions.length} warn />
            <Stat label="Всего подписок" value={data.totalSubscriptions} />
            <Stat label="Web users" value={data.phonesWithWebSubscription} />
            <Stat label="Native users" value={data.phonesWithNativeSubscription} />
            <Stat label="Android native" value={data.phonesWithAndroidNativeSubscription} />
            <Stat label="iOS native" value={data.phonesWithIosNativeSubscription} />
          </div>

          <div className="rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-3 py-2 bg-gray-50 text-xs font-medium text-gray-600">
              По платформам (подписки)
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-gray-100">
              <Cell label="Web" value={data.subscriptionsByPlatform.web} />
              <Cell label="Android" value={data.subscriptionsByPlatform.android} />
              <Cell label="iOS" value={data.subscriptionsByPlatform.ios} />
              <Cell label="Unknown/native" value={data.subscriptionsByPlatform.unknown} />
            </div>
          </div>

          {data.invalidNativeSubscriptions.length > 0 && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Найдены native-подписки без nativeToken: {data.invalidNativeSubscriptions.length}.
            </p>
          )}

          {data.phonesWithoutSubscriptions.length > 0 && (
            <div className="rounded-xl border border-gray-100 overflow-hidden">
              <div className="px-3 py-2 bg-gray-50 text-xs font-medium text-gray-600">
                Номера без push-подписки
              </div>
              <div className="p-3 text-xs text-gray-700 break-all">
                {data.phonesWithoutSubscriptions.join(", ")}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-3 py-2 bg-gray-50 text-xs font-medium text-gray-600">Топ номеров по подпискам</div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Телефон</th>
                    <th className="text-right px-3 py-2 font-medium">Всего</th>
                    <th className="text-right px-3 py-2 font-medium">Web</th>
                    <th className="text-right px-3 py-2 font-medium">Android</th>
                    <th className="text-right px-3 py-2 font-medium">iOS</th>
                    <th className="text-right px-3 py-2 font-medium">Unknown</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.topPhones.map((row) => (
                    <tr key={row.phone}>
                      <td className="px-3 py-2 text-gray-900">{row.phone}</td>
                      <td className="px-3 py-2 text-right">{row.total}</td>
                      <td className="px-3 py-2 text-right">{row.web}</td>
                      <td className="px-3 py-2 text-right">{row.android}</td>
                      <td className="px-3 py-2 text-right">{row.ios}</td>
                      <td className="px-3 py-2 text-right">{row.unknown}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <p className="p-4 text-sm text-gray-500">Нет данных</p>
      )}
    </section>
  );
}

function Stat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className={`rounded-xl border px-3 py-2 ${warn ? "border-amber-200 bg-amber-50" : "border-gray-200"}`}>
      <div className="text-[11px] text-gray-500">{label}</div>
      <div className="text-lg font-semibold text-gray-900">{value}</div>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-3 py-2">
      <div className="text-[11px] text-gray-500">{label}</div>
      <div className="text-base font-semibold text-gray-900">{value}</div>
    </div>
  );
}
