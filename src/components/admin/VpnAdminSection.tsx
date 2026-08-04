"use client";

import { useCallback, useEffect, useState } from "react";

interface VpnStatus {
  configured: boolean;
  enabled: boolean;
  endpoint: string | null;
  liveListenPort?: number | null;
  livePeerCount?: number;
  portMismatch?: boolean;
  syncCommandSet: boolean;
  activePeers: number;
  phonesWithPeers: number;
  amneziaConfigured: boolean;
  amneziaEnabled: boolean;
  amneziaEndpoint: string | null;
  amneziaRunning: boolean;
  amneziaListenPort?: number | null;
  amneziaLivePeerCount?: number;
  amneziaPortMismatch?: boolean;
  amneziaPortalPeers?: number;
}

export function VpnAdminSection() {
  const [status, setStatus] = useState<VpnStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/admin/vpn/status");
      if (!res.ok) throw new Error("load failed");
      setStatus((await res.json()) as VpnStatus);
    } catch {
      setError("Не удалось загрузить статус VPN");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSync() {
    setSyncing(true);
    setMsg(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/vpn/sync", { method: "POST" });
      const data = (await res.json()) as { ok?: boolean; error?: string; activePeers?: number };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Синхронизация не удалась");
        return;
      }
      setMsg(`WireGuard обновлён: ${data.activePeers ?? "?"} активных устройств в Redis`);
      await load();
    } catch {
      setError("Не удалось синхронизировать WireGuard");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
        <h2 className="text-xs font-mono uppercase tracking-wider text-gray-500">VPN</h2>
        <p className="text-xs text-gray-400 mt-1">
          Пользователи на <span className="font-mono">/tools/vpn</span> выбирают WireGuard или
          AmneziaVPN. Включайте VPN для номеров в whitelist ниже.
        </p>
      </div>
      <div className="p-4 space-y-4 text-sm text-gray-700">
        {error && <p className="text-red-700">{error}</p>}
        {!status ? (
          <p className="text-gray-500">Загрузка…</p>
        ) : (
          <>
            <div className="space-y-2">
              <p className="text-xs font-mono uppercase tracking-wider text-gray-500">WireGuard (wg0)</p>
              <p>
                Сервер:{" "}
                <span className={status.configured ? "text-emerald-700" : "text-amber-700"}>
                  {status.configured ? "готов" : "не настроен"}
                </span>
              </p>
              {status.endpoint && (
                <p>
                  Endpoint: <span className="font-mono text-xs">{status.endpoint}</span>
                </p>
              )}
              {status.liveListenPort != null && (
                <p>
                  Слушает:{" "}
                  <span
                    className={
                      status.portMismatch ? "font-mono text-xs text-amber-700" : "font-mono text-xs"
                    }
                  >
                    UDP {status.liveListenPort}
                    {status.livePeerCount != null ? ` · ${status.livePeerCount} peer на wg0` : ""}
                  </span>
                </p>
              )}
              {status.portMismatch && (
                <p className="text-xs text-amber-700">
                  Порт в .env и на wg0 не совпадают — «Синхронизировать WireGuard».
                </p>
              )}
              <button
                type="button"
                disabled={syncing}
                onClick={() => void handleSync()}
                className="text-xs px-3 py-1.5 rounded-lg border border-violet-200 bg-violet-50 text-violet-800 font-medium hover:bg-violet-100 disabled:opacity-50"
              >
                {syncing ? "Синхронизация…" : "Синхронизировать WireGuard"}
              </button>
            </div>

            <div className="border-t border-gray-100 pt-4 space-y-2">
              <p className="text-xs font-mono uppercase tracking-wider text-gray-500">
                AmneziaWG (awg0, Россия)
              </p>
              <p>
                Сервер:{" "}
                <span className={status.amneziaConfigured ? "text-emerald-700" : "text-amber-700"}>
                  {status.amneziaConfigured
                    ? status.amneziaRunning
                      ? "работает"
                      : "настроен, awg0 не запущен"
                    : "не установлен"}
                </span>
              </p>
              {status.amneziaEndpoint && (
                <p>
                  Endpoint: <span className="font-mono text-xs">{status.amneziaEndpoint}</span>
                </p>
              )}
              {status.amneziaListenPort != null && status.amneziaRunning && (
                <p>
                  Слушает:{" "}
                  <span
                    className={
                      status.amneziaPortMismatch
                        ? "font-mono text-xs text-amber-700"
                        : "font-mono text-xs"
                    }
                  >
                    UDP {status.amneziaListenPort}
                    {status.amneziaLivePeerCount != null
                      ? ` · ${status.amneziaLivePeerCount} peer на awg0`
                      : ""}
                  </span>
                </p>
              )}
              {status.amneziaPortalPeers != null && (
                <p className="text-xs text-gray-500">
                  Устройств Amnezia через портал: {status.amneziaPortalPeers}
                </p>
              )}
              {!status.amneziaConfigured && (
                <p className="text-xs text-amber-700">
                  Установка:{" "}
                  <span className="font-mono">sudo bash scripts/deploy/amneziawg-bootstrap.sh</span>
                </p>
              )}
            </div>

            <p className="text-xs text-gray-500 border-t border-gray-100 pt-3">
              Всего активных устройств (WireGuard + Amnezia): {status.activePeers} · номеров с VPN:{" "}
              {status.phonesWithPeers}
            </p>
            {!status.syncCommandSet && (
              <p className="text-xs text-amber-700">
                VPN_SYNC_COMMAND не задан — WireGuard peers только в Redis.
              </p>
            )}
            {msg && <p className="text-xs text-emerald-700">{msg}</p>}
          </>
        )}
      </div>
    </section>
  );
}
