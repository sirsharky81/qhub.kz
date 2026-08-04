"use client";

import { useCallback, useEffect, useState } from "react";

interface VpnStatus {
  configured: boolean;
  enabled: boolean;
  endpoint: string | null;
  syncCommandSet: boolean;
  activePeers: number;
  phonesWithPeers: number;
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
        <h2 className="text-xs font-mono uppercase tracking-wider text-gray-500">VPN (WireGuard)</h2>
        <p className="text-xs text-gray-400 mt-1">
          Включайте VPN для номеров в whitelist ниже. Если у родных не открывается{" "}
          <span className="font-mono">/tools/vpn</span> (блокировка сети), нажмите «Конфиг VPN» и
          отправьте файл или текст конфига вручную. Endpoint:{" "}
          <span className="font-mono">UDP 443</span> — в старых конфигах замените{" "}
          <span className="font-mono">:51820</span> на <span className="font-mono">:443</span>.
        </p>
      </div>
      <div className="p-4 space-y-2 text-sm text-gray-700">
        {error && <p className="text-red-700">{error}</p>}
        {!status ? (
          <p className="text-gray-500">Загрузка…</p>
        ) : (
          <>
            <p>
              Сервер:{" "}
              <span className={status.configured ? "text-emerald-700" : "text-amber-700"}>
                {status.configured ? "готов" : "не настроен (см. docs/vpn.md)"}
              </span>
            </p>
            {status.endpoint && (
              <p>
                Endpoint: <span className="font-mono text-xs">{status.endpoint}</span>
              </p>
            )}
            <p>
              Активных устройств: {status.activePeers} · номеров с VPN: {status.phonesWithPeers}
            </p>
            {!status.syncCommandSet && (
              <p className="text-xs text-amber-700">
                VPN_SYNC_COMMAND не задан — peers сохраняются в Redis, но WireGuard на сервере нужно
                синхронизировать вручную.
              </p>
            )}
            <button
              type="button"
              disabled={syncing}
              onClick={() => void handleSync()}
              className="mt-2 text-xs px-3 py-1.5 rounded-lg border border-violet-200 bg-violet-50 text-violet-800 font-medium hover:bg-violet-100 disabled:opacity-50"
            >
              {syncing ? "Синхронизация…" : "Синхронизировать WireGuard"}
            </button>
            {msg && <p className="text-xs text-emerald-700">{msg}</p>}
          </>
        )}
      </div>
    </section>
  );
}
