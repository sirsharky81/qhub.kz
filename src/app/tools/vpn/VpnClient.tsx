"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { VpnPeerPublic } from "@/lib/vpn/types";
import { maskPhone } from "@/lib/messenger/phone-format";
import { platformFetch } from "@/lib/platform/api-client";

interface AccessState {
  allowed: boolean;
  vpnEnabled: boolean;
  messengerLoggedIn: boolean;
  configured: boolean;
  phone?: string;
  peers: VpnPeerPublic[];
}

export function VpnClient() {
  const router = useRouter();
  const [state, setState] = useState<AccessState | null>(null);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyPeerId, setBusyPeerId] = useState<string | null>(null);
  const [qrByPeer, setQrByPeer] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await platformFetch("/api/vpn/access-check");
      const data = (await res.json()) as AccessState & { error?: string };
      setState({
        allowed: Boolean(data.allowed),
        vpnEnabled: Boolean(data.vpnEnabled),
        messengerLoggedIn: Boolean(data.messengerLoggedIn),
        configured: Boolean(data.configured),
        phone: data.phone,
        peers: Array.isArray(data.peers) ? data.peers : [],
      });
    } catch {
      setError("Не удалось проверить доступ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setError(null);
    const res = await platformFetch("/api/vpn/peers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: label.trim() || "Устройство" }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error ?? "Не удалось создать конфиг");
      return;
    }
    setLabel("");
    setMsg("Конфигурация создана. Скачайте файл или отсканируйте QR.");
    await load();
  }

  async function handleRevoke(peerId: string) {
    setMsg(null);
    setError(null);
    setBusyPeerId(peerId);
    try {
      const res = await platformFetch(`/api/vpn/peers/${peerId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Не удалось отключить");
        return;
      }
      setQrByPeer((prev) => {
        const next = { ...prev };
        delete next[peerId];
        return next;
      });
      setMsg("Устройство отключено");
      await load();
    } finally {
      setBusyPeerId(null);
    }
  }

  async function handleDownload(peerId: string) {
    setMsg(null);
    setError(null);
    const res = await platformFetch(`/api/vpn/peers/${peerId}/config`);
    const data = (await res.json()) as { config?: string; filename?: string; error?: string };
    if (!res.ok || !data.config) {
      setError(data.error ?? "Не удалось получить конфиг");
      return;
    }
    const blob = new Blob([data.config], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = data.filename ?? "qhub-vpn.conf";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleShowQr(peerId: string) {
    if (qrByPeer[peerId]) {
      setQrByPeer((prev) => {
        const next = { ...prev };
        delete next[peerId];
        return next;
      });
      return;
    }
    setMsg(null);
    setError(null);
    const res = await platformFetch(`/api/vpn/peers/${peerId}/qr`);
    const data = (await res.json()) as { qrDataUrl?: string; error?: string };
    if (!res.ok || !data.qrDataUrl) {
      setError(data.error ?? "Не удалось создать QR");
      return;
    }
    setQrByPeer((prev) => ({ ...prev, [peerId]: data.qrDataUrl! }));
  }

  async function handleCopyConfig(peerId: string) {
    const res = await platformFetch(`/api/vpn/peers/${peerId}/config`);
    const data = (await res.json()) as { config?: string; error?: string };
    if (!res.ok || !data.config) {
      setError(data.error ?? "Не удалось скопировать");
      return;
    }
    await navigator.clipboard.writeText(data.config);
    setMsg("Конфиг скопирован в буфер обмена");
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500 text-sm">
        Загрузка…
      </div>
    );
  }

  if (!state?.messengerLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl border border-gray-200 bg-white p-6 space-y-4 text-center">
          <h1 className="text-lg font-bold text-gray-900">Доступ по приглашению</h1>
          <p className="text-sm text-gray-600">
            Этот раздел доступен только пользователям, которым администратор выдал доступ. Войдите
            через мессенджер — если VPN для вашего номера включён, здесь появятся настройки.
          </p>
          <button
            type="button"
            onClick={() => router.push("/tools/messenger/login?next=/tools/vpn")}
            className="w-full rounded-xl bg-gray-900 text-white px-4 py-2.5 text-sm font-semibold"
          >
            Войти
          </button>
        </div>
      </div>
    );
  }

  if (!state.vpnEnabled) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl border border-gray-200 bg-white p-6 space-y-3 text-center">
          <h1 className="text-lg font-bold text-gray-900">VPN не включён</h1>
          <p className="text-sm text-gray-600">
            Для номера {state.phone ? maskPhone(state.phone) : ""} VPN ещё не активирован. Обратитесь
            к администратору портала.
          </p>
        </div>
      </div>
    );
  }

  if (!state.configured) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl border border-amber-200 bg-amber-50 p-6 space-y-3 text-center">
          <h1 className="text-lg font-bold text-amber-900">VPN настраивается</h1>
          <p className="text-sm text-amber-800">
            Сервер VPN ещё не готов. Попробуйте позже или свяжитесь с администратором.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-xl mx-auto space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold text-gray-900">QHub VPN</h1>
          <p className="text-sm text-gray-600">
            Безопасный туннель через ваш сервер. Установите приложение WireGuard и импортируйте
            конфигурацию.
          </p>
        </header>

        <section className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-900">Приложение WireGuard (бесплатно)</h2>
          <p className="text-sm text-gray-600">
            VPN работает через официальное бесплатное приложение WireGuard — QHub выдаёт конфиг,
            туннель поднимает WireGuard на вашем устройстве.
          </p>
          <ol className="text-sm text-gray-600 space-y-2 list-decimal list-inside">
            <li>Установите WireGuard (ссылки ниже).</li>
            <li>Добавьте устройство на этой странице — скачайте `.conf` или отсканируйте QR.</li>
            <li>Импортируйте конфиг в WireGuard и включите туннель.</li>
          </ol>
          <div className="flex flex-wrap gap-2 text-xs">
            <a
              href="https://apps.apple.com/app/wireguard/id1441195209"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"
            >
              App Store (iOS)
            </a>
            <a
              href="https://play.google.com/store/apps/details?id=com.wireguard.android"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"
            >
              Google Play (Android)
            </a>
            <a
              href="https://www.wireguard.com/install/"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"
            >
              Windows / macOS / Linux
            </a>
          </div>
        </section>

        <section className="rounded-2xl border border-violet-100 bg-violet-50/50 p-4 space-y-2">
          <h2 className="text-sm font-semibold text-violet-900">Скоро: VPN в приложении QHub</h2>
          <p className="text-xs text-violet-800">
            В будущем переключатель VPN появится прямо в приложении QHub — без WireGuard. Сейчас
            используйте бесплатный WireGuard: это самый быстрый и надёжный вариант.
          </p>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <h2 className="text-xs font-mono uppercase tracking-wider text-gray-500">Новое устройство</h2>
          </div>
          <form onSubmit={handleCreate} className="p-4 flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Например: iPhone мамы"
              className="flex-1 rounded-xl border border-gray-200 px-4 py-2 text-sm"
              maxLength={64}
            />
            <button
              type="submit"
              className="rounded-xl bg-gray-900 text-white px-4 py-2 text-sm font-semibold shrink-0"
            >
              Создать
            </button>
          </form>
        </section>

        {error && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {error}
          </p>
        )}
        {msg && (
          <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
            {msg}
          </p>
        )}

        <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <h2 className="text-xs font-mono uppercase tracking-wider text-gray-500">Ваши устройства</h2>
          </div>
          {state.peers.length === 0 ? (
            <p className="p-4 text-sm text-gray-500">Пока нет устройств. Создайте конфигурацию выше.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {state.peers.map((peer) => (
                <li key={peer.id} className="p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{peer.label}</p>
                      <p className="text-xs text-gray-400 font-mono">
                        {peer.address} · {new Date(peer.createdAt).toLocaleDateString("ru-RU")}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void handleDownload(peer.id)}
                        className="text-xs px-3 py-1.5 rounded-lg border border-sky-200 bg-sky-50 text-sky-800"
                      >
                        Скачать
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleShowQr(peer.id)}
                        className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700"
                      >
                        {qrByPeer[peer.id] ? "Скрыть QR" : "QR-код"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleCopyConfig(peer.id)}
                        className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700"
                      >
                        Копировать
                      </button>
                      <button
                        type="button"
                        disabled={busyPeerId === peer.id}
                        onClick={() => void handleRevoke(peer.id)}
                        className="text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-700"
                      >
                        Отключить
                      </button>
                    </div>
                  </div>
                  {qrByPeer[peer.id] && (
                    <div className="flex justify-center pt-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={qrByPeer[peer.id]}
                        alt={`QR для ${peer.label}`}
                        className="rounded-xl border border-gray-200 bg-white p-2"
                        width={280}
                        height={280}
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
