"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ObdBleSession } from "@/lib/obd/obd-session";
import { formatBleFailure } from "@/lib/obd/ble-error";
import { resolveCanadianOptionCodesForSubaru } from "@/lib/obd/subaru-ssm4-catalog";
import type { SubaruEyesightWriteMode } from "@/lib/obd/subaru-eyesight-variant";
import type { SubaruMeterWriteMode } from "@/lib/obd/subaru-meter-variant";
import {
  createAssistRoom,
  markAssistRegionReady,
  pollAssistRoom,
  pushAssistStatusApi,
  type AssistSession,
} from "@/lib/subaru-assist/client";
import { AssistElmChannel } from "@/lib/subaru-assist/elm-channel";
import { AssistPeer, type AssistLinkState } from "@/lib/subaru-assist/peer";
import { RemoteElm327 } from "@/lib/subaru-assist/remote-elm";
import {
  assistServiceLabel,
  type AssistService,
  type AssistStatusCode,
} from "@/lib/subaru-assist/status";
import type { AssistRoomState } from "@/lib/subaru-assist/store";
import { SubaruImmoSection } from "./SubaruImmoSection";

async function copyCode(code: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(code);
    return true;
  } catch {
    return false;
  }
}

export function SubaruRemoteDesk() {
  const [session, setSession] = useState<AssistSession | null>(null);
  const [roomState, setRoomState] = useState<AssistRoomState | null>(null);
  const [link, setLink] = useState<AssistLinkState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [meterLine, setMeterLine] = useState<string | null>(null);
  const [eyesightLine, setEyesightLine] = useState<string | null>(null);
  const [targetLine, setTargetLine] = useState<string | null>(null);
  const [clearLine, setClearLine] = useState<string | null>(null);
  const [meterMode, setMeterMode] = useState<SubaruMeterWriteMode>("two-did");
  const [eyesightMode, setEyesightMode] = useState<SubaruEyesightWriteMode>("full-yyw");
  const [clientHere, setClientHere] = useState(false);
  const [hasTarget, setHasTarget] = useState(false);
  const [obdReady, setObdReady] = useState(false);
  const [regionReady, setRegionReady] = useState(false);
  const meterWrittenRef = useRef(false);
  const eyesightWrittenRef = useRef(false);
  const appliedRef = useRef("");
  const optionRef = useRef("");
  const peerRef = useRef<AssistPeer | null>(null);
  const channelRef = useRef<AssistElmChannel | null>(null);
  const obdRef = useRef<ObdBleSession | null>(null);
  const sessionRef = useRef<AssistSession | null>(null);
  sessionRef.current = session;

  const emit = useCallback(async (code: AssistStatusCode) => {
    channelRef.current?.publishStatus(code);
    const current = sessionRef.current;
    if (!current) return;
    try {
      await pushAssistStatusApi(current, code);
    } catch {
      /* the data channel already carried the phrase */
    }
  }, []);

  const ensureObd = useCallback(() => {
    const channel = channelRef.current;
    if (!channel) throw new Error("Канал к клиенту ещё не открыт");
    if (!obdRef.current) {
      const elm = new RemoteElm327((command, timeoutMs) => channel.request(command, timeoutMs));
      const obd = new ObdBleSession();
      obd.attachRemoteElm(elm);
      obdRef.current = obd;
    }
    return obdRef.current;
  }, []);

  useEffect(() => {
    return () => {
      peerRef.current?.close();
      obdRef.current?.detachRemoteElm();
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    let stop = false;
    const tick = async () => {
      try {
        const snapshot = await pollAssistRoom(session, 0);
        if (!stop) {
          setRoomState(snapshot.state);
          setClientHere(snapshot.members.some((member) => member.role === "client"));
        }
      } catch (err) {
        if (!stop) setError(err instanceof Error ? err.message : "Комната недоступна");
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), 1500);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [session]);

  const createRoom = async () => {
    setError(null);
    try {
      const created = await createAssistRoom();
      setSession(created);
      const peer = new AssistPeer(created, (state) => {
        setLink(state);
        if (state === "failed") {
          channelRef.current?.failAll("Связь с vLinker прервана");
          void emit("link_lost");
        }
      });
      channelRef.current = new AssistElmChannel(peer, () => undefined);
      peerRef.current = peer;
      await peer.start();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось создать комнату");
    }
  };

  const service = roomState?.service ?? null;
  const adapterOnline = roomState?.adapter === "online" && link === "connected";

  useEffect(() => {
    if (!adapterOnline || obdReady) return;
    try {
      ensureObd();
      setObdReady(true);
    } catch {
      /* channel appears with the peer */
    }
  }, [adapterOnline, ensureObd, obdReady]);

  const readMeter = async () => {
    if (!adapterOnline || busy) return;
    setBusy(true);
    setError(null);
    await emit("meter_read");
    try {
      const result = await ensureObd().readSubaruMeter12ColumnCode("6");
      const applied = result.match.actualAppliedModel;
      const option = result.match.actualOptionCode;
      appliedRef.current = applied;
      optionRef.current = option;
      setHasTarget(true);
      const canada = resolveCanadianOptionCodesForSubaru(applied, option);
      setMeterLine(`${applied}+${option} · ${result.match.actualRegion}`);
      setTargetLine(`Цель °C: ${applied}+${canada.primaryC0}`);
      await emit("meter_ok");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка чтения приборки");
      await emit("meter_fail");
    } finally {
      setBusy(false);
    }
  };

  const readEyesight = async () => {
    if (!adapterOnline || busy) return;
    setBusy(true);
    setError(null);
    await emit("eyesight_read");
    try {
      const result = await ensureObd().readSubaruEyesightVariantCode("6", appliedRef.current || undefined);
      const hint = result.match.destinationHint ?? "регион не определён";
      const code = result.match.optionCode ?? "—";
      setEyesightLine(`EyeSight ${code} · ${hint}`);
      await emit("eyesight_ok");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка чтения EyeSight");
      await emit("eyesight_fail");
    } finally {
      setBusy(false);
    }
  };

  const writeMeter = async () => {
    if (!adapterOnline || busy || !appliedRef.current) return;
    const canada = resolveCanadianOptionCodesForSubaru(appliedRef.current, optionRef.current);
    setBusy(true);
    setError(null);
    await emit("write_start");
    try {
      const result = await ensureObd().writeSubaruMeter12ColumnCode(
        appliedRef.current,
        canada.primaryC0,
        "6",
        undefined,
        { writeMode: meterMode },
      );
      if (!result.success) {
        setError(result.steps.at(-1) ?? "Запись приборки не подтверждена");
        await emit("write_fail");
      } else {
        meterWrittenRef.current = true;
        if (eyesightWrittenRef.current) {
          setRegionReady(true);
          const current = sessionRef.current;
          if (current) await markAssistRegionReady(current);
        }
        setMeterLine(`${appliedRef.current}+${canada.primaryC0}`);
        await emit("write_ok");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка записи приборки");
      await emit("write_fail");
    } finally {
      setBusy(false);
    }
  };

  const writeEyesight = async () => {
    if (!adapterOnline || busy || !appliedRef.current) return;
    const canada = resolveCanadianOptionCodesForSubaru(appliedRef.current, optionRef.current);
    setBusy(true);
    setError(null);
    await emit("write_start");
    try {
      const result = await ensureObd().writeSubaruEyesightVariantCode(
        appliedRef.current,
        canada.primaryC0,
        "6",
        undefined,
        { writeMode: eyesightMode },
      );
      if (!result.success) {
        setError(result.steps.at(-1) ?? "Запись EyeSight не подтверждена");
        await emit("write_fail");
      } else {
        eyesightWrittenRef.current = true;
        if (meterWrittenRef.current) {
          setRegionReady(true);
          const current = sessionRef.current;
          if (current) await markAssistRegionReady(current);
        }
        await emit("write_ok");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка записи EyeSight");
      await emit("write_fail");
    } finally {
      setBusy(false);
    }
  };

  const clearHistory = async () => {
    if (!adapterOnline || busy || !regionReady) return;
    setBusy(true);
    setError(null);
    await emit("clear_start");
    try {
      const result = await ensureObd().clearSubaruRegionHistory("6");
      setClearLine(
        `Было: приборка ${result.meterBefore.join(", ") || "—"}, EyeSight ${result.eyesightBefore.join(", ") || "—"}. Осталось: приборка ${result.meterAfter.join(", ") || "—"}, EyeSight ${result.eyesightAfter.join(", ") || "—"}.`,
      );
      await emit("clear_ok");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сбросить ошибки");
      await emit("clear_fail");
    } finally {
      setBusy(false);
    }
  };

  const onImmoProgress = (event: "start" | "ok" | "fail" | "present-key") => {
    if (!service || service === "celsius") return;
    if (event === "present-key") {
      void emit("key_present");
      return;
    }
    const start = service === "key" ? "key_step" : "res_step";
    const ok = service === "key" ? "key_ok" : "res_ok";
    const fail = service === "key" ? "key_fail" : "res_fail";
    void emit(event === "start" ? start : event === "ok" ? ok : fail);
  };

  return (
    <div className="space-y-3">
      <section className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
        <div>
          <h2 className="text-sm font-bold text-gray-900">Удалённое подключение</h2>
          <p className="text-xs text-gray-500">
            Создайте комнату и отправьте код клиенту. У него vLinker и зажигание, у вас — то же меню записи, без показа байтов клиенту.
          </p>
        </div>
        {!session ? (
          <button
            type="button"
            onClick={() => void createRoom()}
            className="w-full rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white"
          >
            Создать комнату
          </button>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-gray-500">Код комнаты</div>
                <div className="font-mono text-2xl font-bold tracking-[0.2em] text-gray-900">{session.roomCode}</div>
              </div>
              <button
                type="button"
                onClick={() => void copyCode(session.roomCode).then((ok) => setCopied(ok))}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold"
              >
                {copied ? "Скопировано" : "Скопировать"}
              </button>
            </div>
            <Presence service={service} clientHere={clientHere} state={roomState} link={link} />
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-xs font-medium text-red-800">{error}</div>
        )}
      </section>

      {session && service === "celsius" && (
        <section className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
          <h3 className="text-sm font-bold text-gray-900">Перевод с °F на °C</h3>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <label className="space-y-1">
              <span className="text-gray-500">Запись приборки</span>
              <select
                value={meterMode}
                onChange={(e) => setMeterMode(e.target.value as SubaruMeterWriteMode)}
                className="w-full rounded-lg border border-gray-200 px-2 py-2"
              >
                <option value="two-did">two-did</option>
                <option value="full-cgdw">full-cgdw</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-gray-500">Запись EyeSight</span>
              <select
                value={eyesightMode}
                onChange={(e) => setEyesightMode(e.target.value as SubaruEyesightWriteMode)}
                className="w-full rounded-lg border border-gray-200 px-2 py-2"
              >
                <option value="full-yyw">full-yyw</option>
                <option value="region-only">region-only</option>
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={!adapterOnline || busy} onClick={() => void readMeter()} className="rounded-xl bg-blue-800 px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-40">
              Считать приборку
            </button>
            <button type="button" disabled={!adapterOnline || busy} onClick={() => void readEyesight()} className="rounded-xl bg-violet-700 px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-40">
              Считать EyeSight
            </button>
            <button type="button" disabled={!adapterOnline || busy || !hasTarget} onClick={() => void writeMeter()} className="rounded-xl bg-gray-900 px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-40">
              Перезаписать приборку
            </button>
            <button type="button" disabled={!adapterOnline || busy || !hasTarget} onClick={() => void writeEyesight()} className="rounded-xl bg-gray-900 px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-40">
              Перезаписать EyeSight
            </button>
          </div>
          {meterLine && <p className="text-xs text-gray-700">{meterLine}</p>}
          {eyesightLine && <p className="text-xs text-gray-700">{eyesightLine}</p>}
          {targetLine && <p className="text-xs font-medium text-gray-900">{targetLine}</p>}
          <button
            type="button"
            disabled={!adapterOnline || busy || !regionReady}
            onClick={() => void clearHistory()}
            className="w-full rounded-xl border border-amber-400 bg-amber-50 px-3 py-2.5 text-xs font-semibold text-amber-950 disabled:opacity-40"
          >
            Сбросить ошибки history
          </button>
          {clearLine && <p className="text-xs text-gray-700">{clearLine}</p>}
        </section>
      )}

      {session && (service === "key" || service === "res") && obdReady && obdRef.current && (
        <section className="space-y-2">
          <button
            type="button"
            onClick={() => void emit("key_present")}
            className="w-full rounded-xl border border-amber-400 bg-amber-50 px-3 py-2.5 text-xs font-semibold text-amber-950"
          >
            Попросить поднести ключ к START
          </button>
          <SubaruImmoSection
            session={obdRef.current}
            ready
            busy={busy}
            setBusy={setBusy}
            setError={setError}
            initialSubTab={service === "res" ? "register-res" : "register-key"}
            onProgress={onImmoProgress}
          />
        </section>
      )}
    </div>
  );
}

function Presence({
  service,
  clientHere,
  state,
  link,
}: {
  service: AssistService | null;
  clientHere: boolean;
  state: AssistRoomState | null;
  link: AssistLinkState;
}) {
  const rows = [
    ["Клиент в комнате", clientHere ? "да" : "ожидание"],
    ["Сервис", service ? assistServiceLabel(service) : "не выбран"],
    ["Зажигание", state?.ignition ? "включено" : "нет"],
    ["vLinker", state?.adapter === "online" ? "подключён" : "нет"],
    ["Канал", link === "connected" ? "открыт" : link === "connecting" ? "поднимается" : "нет"],
  ];
  return (
    <ul className="grid grid-cols-2 gap-2 text-xs">
      {rows.map(([label, value]) => (
        <li key={label} className="rounded-lg border border-gray-200 px-2 py-1.5">
          <div className="text-gray-500">{label}</div>
          <div className="font-semibold text-gray-900">{value}</div>
        </li>
      ))}
    </ul>
  );
}
