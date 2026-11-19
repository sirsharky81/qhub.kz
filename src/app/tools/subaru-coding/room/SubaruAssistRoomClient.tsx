"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { formatBleFailure } from "@/lib/obd/ble-error";
import { ObdBleSession } from "@/lib/obd/obd-session";
import {
  joinAssistRoom,
  patchAssistClient,
  pollAssistRoom,
  type AssistSession,
} from "@/lib/subaru-assist/client";
import { assistElmResponse } from "@/lib/subaru-assist/elm-channel";
import { parseAssistFrame } from "@/lib/subaru-assist/protocol";
import { AssistPeer } from "@/lib/subaru-assist/peer";
import {
  assistServiceLabel,
  assistStatusText,
  assistStatusTone,
  isAssistStatusCode,
  type AssistService,
  type AssistStatusCode,
} from "@/lib/subaru-assist/status";

type Step = "code" | "service" | "ignition" | "adapter" | "live";

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
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [service, setService] = useState<AssistService | null>(null);
  const peerRef = useRef<AssistPeer | null>(null);
  const obdRef = useRef<ObdBleSession | null>(null);
  const seen = useRef(new Set<string>());

  const pushCode = (status: AssistStatusCode, at = Date.now()) => {
    const key = `${status}:${at}`;
    if (seen.current.has(key)) return;
    seen.current.add(key);
    setLogs((prev) => [...prev, { at, code: status }].slice(-30));
  };

  useEffect(() => {
    return () => {
      peerRef.current?.close();
      void obdRef.current?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    let stop = false;
    const tick = async () => {
      try {
        const snapshot = await pollAssistRoom(session, 0);
        if (stop) return;
        for (const item of snapshot.state.statuses) {
          pushCode(item.code, item.at);
        }
      } catch {
        /* keep the last log on screen */
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
      setSession(joined);
      const peer = new AssistPeer(joined, (state) => {
        if (state === "failed") pushCode("link_lost");
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
      setStep("service");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось войти");
    } finally {
      setBusy(false);
    }
  };

  const chooseService = async (next: AssistService) => {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      await patchAssistClient(session, { service: next });
      setService(next);
      setStep("ignition");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось выбрать сервис");
    } finally {
      setBusy(false);
    }
  };

  const confirmIgnition = async () => {
    if (!session) return;
    setBusy(true);
    try {
      await patchAssistClient(session, { ignition: true });
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
      const obd = new ObdBleSession();
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

  return (
    <div className="mx-auto max-w-md space-y-3 p-4">
      <header className="space-y-1">
        <div className="text-[11px] uppercase tracking-wider text-gray-500">QHub · Subaru</div>
        <h1 className="text-xl font-bold text-gray-900">Комната сервиса</h1>
        <p className="text-sm text-gray-600">
          {service ? assistServiceLabel(service) : "Мастер прислал код. Дальше только статус, без настроек блока."}
        </p>
      </header>

      {step === "code" && (
        <section className="space-y-2 rounded-2xl border border-gray-200 bg-white p-4">
          <label className="block text-xs font-semibold text-gray-700">Код комнаты</label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            autoCapitalize="characters"
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

      {step === "service" && (
        <section className="space-y-2">
          {(["celsius", "key", "res"] as const).map((item) => (
            <button
              key={item}
              type="button"
              disabled={busy}
              onClick={() => void chooseService(item)}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-left text-sm font-semibold text-gray-900"
            >
              {assistServiceLabel(item)}
            </button>
          ))}
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
          <p className="text-sm text-gray-700">Подключите vLinker по Bluetooth. Зажигание оставьте включённым.</p>
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
        <section className="space-y-2 rounded-2xl border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-bold text-gray-900">Статус</h2>
          <ol className="space-y-2">
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
