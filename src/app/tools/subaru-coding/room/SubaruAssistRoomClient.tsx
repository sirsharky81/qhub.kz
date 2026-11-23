"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { formatBleFailure } from "@/lib/obd/ble-error";
import { ObdBleSession } from "@/lib/obd/obd-session";
import {
  joinAssistRoom,
  leaveAssistRoom,
  patchAssistClient,
  pollAssistRoom,
  type AssistSession,
} from "@/lib/subaru-assist/client";
import { assistElmResponse } from "@/lib/subaru-assist/elm-channel";
import { parseAssistFrame } from "@/lib/subaru-assist/protocol";
import { AssistPeer, type AssistLinkState } from "@/lib/subaru-assist/peer";
import { clearAssistRoom, loadAssistRoom, saveAssistRoom } from "@/lib/subaru-assist/persist";
import { ASSIST_ROOM_TTL_MS } from "@/lib/subaru-assist/room-clock";
import {
  assistServiceLabel,
  assistStatusText,
  assistStatusTone,
  isAssistStatusCode,
  type AssistStatusCode,
} from "@/lib/subaru-assist/status";
import { AssistRoomClock } from "../AssistRoomClock";

type Step = "code" | "ignition" | "adapter" | "live";

interface LogLine {
  at: number;
  code: AssistStatusCode;
}

export function SubaruAssistRoomClient() {
  const [step, setStep] = useState<Step>("code");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState<AssistSession | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [serviceLabel, setServiceLabel] = useState("Мастер ещё не выбрал сервис");
  const [link, setLink] = useState<AssistLinkState>("idle");
  const [ignitionOn, setIgnitionOn] = useState(false);
  const peerRef = useRef<AssistPeer | null>(null);
  const obdRef = useRef<ObdBleSession | null>(null);
  const seen = useRef(new Set<string>());
  const sawDropRef = useRef(false);

  const pushCode = (status: AssistStatusCode, at = Date.now()) => {
    const key = `${status}:${at}`;
    if (seen.current.has(key)) return;
    seen.current.add(key);
    setLogs((prev) => [...prev, { at, code: status }].slice(-30));
  };

  const forgetRoom = (message: string | null) => {
    peerRef.current?.close();
    peerRef.current = null;
    void obdRef.current?.disconnect();
    obdRef.current = null;
    clearAssistRoom("client");
    setSession(null);
    setExpiresAt(null);
    setStep("code");
    setBusy(false);
    setError(message);
  };

  const startPeer = async (next: AssistSession, expiry: number) => {
    peerRef.current?.close();
    setSession(next);
    setExpiresAt(expiry);
    saveAssistRoom("client", { session: next, expiresAt: expiry });
    const peer = new AssistPeer(next, (state) => {
      setLink(state);
      if (state === "reconnecting" && !sawDropRef.current) {
        sawDropRef.current = true;
        pushCode("link_lost");
      }
      if (state === "connected" && sawDropRef.current) {
        sawDropRef.current = false;
        pushCode("link_back");
      }
    });
    peer.onMessage((raw) => {
      const frame = parseAssistFrame(raw);
      if (!frame) return;
      if (frame.t === "status" && isAssistStatusCode(frame.code)) {
        pushCode(frame.code);
        return;
      }
      if (frame.t !== "elm") return;
      const elm = obdRef.current?.getElm();
      if (!elm) {
        peer.send(assistElmResponse(frame.id, false, undefined, "Адаптер не подключён"));
        return;
      }
      void elm
        .sendCommand(frame.command, frame.timeoutMs)
        .then((rawResponse) => peer.send(assistElmResponse(frame.id, true, rawResponse)))
        .catch((err: unknown) =>
          peer.send(
            assistElmResponse(frame.id, false, undefined, err instanceof Error ? err.message : "Ошибка адаптера"),
          ),
        );
    });
    peerRef.current = peer;
    await peer.start();
  };

  useEffect(() => {
    const stored = loadAssistRoom("client");
    if (stored) {
      setIgnitionOn(true);
      setStep("adapter");
      setError("Приложение было закрыто. Комната на месте — подключите vLinker ещё раз. Зажигание не выключайте.");
      void startPeer(stored.session, stored.expiresAt).catch(() => {
        forgetRoom("Не удалось вернуться в комнату. Попросите новый код.");
      });
    }
    return () => {
      peerRef.current?.close();
      void obdRef.current?.disconnect();
    };
    // Restore once. startPeer closes the previous peer on the next call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!session) return;
    const onShow = () => {
      if (document.visibilityState === "visible") peerRef.current?.ensureConnected();
    };
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("pageshow", onShow);
    return () => {
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("pageshow", onShow);
    };
  }, [session]);

  useEffect(() => {
    if (!session) return;
    let stop = false;
    const tick = async () => {
      try {
        const snapshot = await pollAssistRoom(session, 0);
        if (stop) return;
        if (snapshot.expiresAt) {
          setExpiresAt(snapshot.expiresAt);
          saveAssistRoom("client", { session, expiresAt: snapshot.expiresAt });
          if (snapshot.closed || snapshot.expiresAt <= Date.now()) {
            forgetRoom("Час комнаты истёк.");
            return;
          }
        }
        setServiceLabel(
          snapshot.state.service ? assistServiceLabel(snapshot.state.service) : "Мастер ещё не выбрал сервис",
        );
        if (snapshot.state.ignition) setIgnitionOn(true);
        for (const item of snapshot.state.statuses) {
          pushCode(item.code, item.at);
        }
      } catch (err) {
        if (stop) return;
        const message = err instanceof Error ? err.message : "";
        if (/истекл|закрыт|не найден/i.test(message)) forgetRoom("Комната закрыта. Попросите новый код.");
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), 1200);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [session]);

  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      const joined = await joinAssistRoom(code);
      await startPeer(joined, Date.now() + ASSIST_ROOM_TTL_MS);
      setStep("ignition");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось войти");
    } finally {
      setBusy(false);
    }
  };

  const confirmIgnition = async () => {
    if (!session) return;
    setBusy(true);
    try {
      await patchAssistClient(session, { ignition: true });
      setIgnitionOn(true);
      pushCode("ignition_on");
      setStep("adapter");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось подтвердить зажигание");
    } finally {
      setBusy(false);
    }
  };

  const connectAdapter = async () => {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const obd = obdRef.current ?? new ObdBleSession();
      obdRef.current = obd;
      await obd.connectAdapter();
      try {
        await obd.linkVehicle();
      } catch {
        /* UDS всё равно идёт через уже открытый адаптер */
      }
      await patchAssistClient(session, { adapter: "online" });
      pushCode("adapter_online");
      setStep("live");
    } catch (err) {
      setError(formatBleFailure(err));
    } finally {
      setBusy(false);
    }
  };

  const leaveRoom = async () => {
    if (!session) return;
    if (!window.confirm("Выйти из комнаты? vLinker отключится, код мастера для вас перестанет действовать.")) return;
    setBusy(true);
    setError(null);
    try {
      await obdRef.current?.disconnect();
      obdRef.current = null;
      await patchAssistClient(session, { adapter: "offline" }).catch(() => undefined);
      await leaveAssistRoom(session);
      forgetRoom(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось выйти из комнаты");
      setBusy(false);
    }
  };

  const disconnectAdapter = async () => {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      await obdRef.current?.disconnect();
      obdRef.current = null;
      await patchAssistClient(session, { adapter: "offline" });
      setStep("adapter");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отключить vLinker");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto min-h-[100dvh] max-w-md space-y-3 p-4 pb-8">
      <header className="space-y-1">
        <div className="text-[11px] uppercase tracking-wider text-gray-500">QHub · Subaru</div>
        <h1 className="text-xl font-bold text-gray-900">Комната сервиса</h1>
        <p className="text-sm text-gray-600">
          {serviceLabel}. На экране только статус: что делать с зажиганием и ключом. Настройки блока остаются у мастера.
        </p>
      </header>

      {session && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
            <AssistRoomClock expiresAt={expiresAt} />
          </div>
          <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
            <div className="text-gray-500">Канал с мастером</div>
            <div className="font-semibold text-gray-900">
              {link === "connected" ? "есть" : link === "reconnecting" ? "восстанавливается" : "ожидание"}
            </div>
          </div>
        </div>
      )}

      {session && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void leaveRoom()}
          className="w-full rounded-xl border border-red-200 bg-white px-4 py-3 text-sm font-semibold text-red-700 disabled:opacity-40"
        >
          Выйти из комнаты
        </button>
      )}

      {step === "code" && (
        <section className="space-y-2 rounded-2xl border border-gray-200 bg-white p-4">
          <label className="block text-xs font-semibold text-gray-700">Код комнаты</label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            autoCapitalize="characters"
            inputMode="text"
            className="w-full rounded-xl border border-gray-300 px-3 py-3 text-center font-mono text-lg tracking-[0.25em]"
            placeholder="КОД"
          />
          <button
            type="button"
            disabled={busy || code.trim().length < 4}
            onClick={() => void join()}
            className="w-full rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            Войти
          </button>
        </section>
      )}

      {step === "ignition" && (
        <section className="space-y-3 rounded-2xl border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-950">Включите зажигание и не глушите его до конца работы.</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void confirmIgnition()}
            className="w-full rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white"
          >
            Зажигание включено
          </button>
        </section>
      )}

      {step === "adapter" && (
        <section className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-700">
            {ignitionOn
              ? "Подключите vLinker по Bluetooth. Зажигание оставьте включённым."
              : "Сначала подтвердите зажигание."}
          </p>
          {!ignitionOn && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void confirmIgnition()}
              className="w-full rounded-xl border border-amber-400 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950"
            >
              Зажигание включено
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => void connectAdapter()}
            className="w-full rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            {busy ? "Подключение…" : "Подключить vLinker"}
          </button>
        </section>
      )}

      {step === "live" && (
        <section className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-gray-900">Статус</h2>
            <button
              type="button"
              disabled={busy}
              onClick={() => void disconnectAdapter()}
              className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 disabled:opacity-40"
            >
              Отключить vLinker
            </button>
          </div>
          <p className="text-[11px] leading-relaxed text-gray-500">
            Если связь с мастером пропадёт, она поднимется снова сама. Это не отключает vLinker и не глушит зажигание.
          </p>
          {link === "reconnecting" && (
            <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-950">
              Канал с мастером восстанавливается. Ничего не выключайте.
            </p>
          )}
          <ol className="space-y-2">
            {logs.length === 0 && <li className="text-sm text-gray-500">Ожидайте мастера. Сервис: {serviceLabel}.</li>}
            {logs.map((line) => {
              const tone = assistStatusTone(line.code);
              const box =
                tone === "warn"
                  ? "border-amber-300 bg-amber-50 text-amber-950"
                  : tone === "ok"
                    ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                    : "border-gray-200 bg-gray-50 text-gray-800";
              return (
                <li key={`${line.at}-${line.code}`} className={`rounded-xl border px-3 py-2 text-sm font-medium ${box}`}>
                  {assistStatusText(line.code)}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {error && <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-xs font-medium text-red-800">{error}</div>}

      <Link href="/tools/subaru-coding" className="block text-center text-xs text-gray-500 underline">
        Карточка сервиса
      </Link>
    </div>
  );
}
