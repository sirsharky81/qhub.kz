"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ObdBleSession } from "@/lib/obd/obd-session";
import {
  createAssistRoom,
  leaveAssistRoom,
  pollAssistRoom,
  pushAssistStatusApi,
  setAssistService,
  type AssistSession,
} from "@/lib/subaru-assist/client";
import { AssistElmChannel } from "@/lib/subaru-assist/elm-channel";
import { AssistPeer, type AssistLinkState } from "@/lib/subaru-assist/peer";
import { clearAssistRoom, loadAssistRoom, saveAssistRoom, type StoredAssistRoom } from "@/lib/subaru-assist/persist";
import { RemoteElm327 } from "@/lib/subaru-assist/remote-elm";
import { ASSIST_ROOM_TTL_MS, assistRemainingMs } from "@/lib/subaru-assist/room-clock";
import {
  assistServiceLabel,
  type AssistService,
  type AssistStatusCode,
} from "@/lib/subaru-assist/status";
import type { AssistRoomState } from "@/lib/subaru-assist/store";
import { AssistRoomClock } from "./AssistRoomClock";

const SERVICES: AssistService[] = ["celsius", "key", "res", "diag"];

async function copyCode(code: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(code);
    return true;
  } catch {
    return false;
  }
}

interface Props {
  obd: ObdBleSession;
  room: StoredAssistRoom | null;
  onRoomChange: (room: StoredAssistRoom | null) => void;
  onAssistSession: (session: AssistSession | null) => void;
  onAttached: (attached: boolean) => void;
  onService: (service: AssistService | null) => void;
}

function rememberRoom(room: StoredAssistRoom | null, onRoomChange: (room: StoredAssistRoom | null) => void): void {
  if (room) saveAssistRoom("master", room);
  else clearAssistRoom("master");
  onRoomChange(room);
}

export function SubaruRemoteDesk({ obd, room, onRoomChange, onAssistSession, onAttached, onService }: Props) {
  const stored = room ?? loadAssistRoom("master");
  const [session, setSession] = useState<AssistSession | null>(stored?.session ?? null);
  const [expiresAt, setExpiresAt] = useState<number | null>(stored?.expiresAt ?? null);
  const [roomState, setRoomState] = useState<AssistRoomState | null>(null);
  const [link, setLink] = useState<AssistLinkState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [clientHere, setClientHere] = useState(false);
  const [restored, setRestored] = useState(false);
  const peerRef = useRef<AssistPeer | null>(null);
  const channelRef = useRef<AssistElmChannel | null>(null);
  const sessionRef = useRef<AssistSession | null>(null);
  const obdRef = useRef(obd);
  const attachedRef = useRef(false);
  const sawDropRef = useRef(false);
  const linkRef = useRef<AssistLinkState>("idle");
  const adapterOnlineRef = useRef(false);
  const onAssistSessionRef = useRef(onAssistSession);
  const onRoomChangeRef = useRef(onRoomChange);
  const freshRoomRef = useRef(false);
  const suppressRestoreRef = useRef(false);
  const onAttachedRef = useRef(onAttached);
  const onServiceRef = useRef(onService);
  obdRef.current = obd;
  sessionRef.current = session;
  onAssistSessionRef.current = onAssistSession;
  onRoomChangeRef.current = onRoomChange;
  onAttachedRef.current = onAttached;
  onServiceRef.current = onService;

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

  const detachElm = useCallback(() => {
    if (!attachedRef.current) return;
    obdRef.current.detachRemoteElm();
    attachedRef.current = false;
    onAttachedRef.current(false);
  }, []);

  const attachElm = useCallback(() => {
    const channel = channelRef.current;
    if (!channel || attachedRef.current) return;
    const elm = new RemoteElm327((command, timeoutMs) => channel.request(command, timeoutMs));
    obdRef.current.attachRemoteElm(elm);
    attachedRef.current = true;
    onAttachedRef.current(true);
  }, []);

  const dropRoom = useCallback(
    (message: string | null) => {
      suppressRestoreRef.current = true;
      peerRef.current?.close();
      peerRef.current = null;
      channelRef.current = null;
      detachElm();
      rememberRoom(null, onRoomChangeRef.current);
      onAssistSessionRef.current(null);
      onServiceRef.current(null);
      setSession(null);
      setExpiresAt(null);
      setRoomState(null);
      setClientHere(false);
      setLink("idle");
      setError(message);
    },
    [detachElm],
  );

  const bindSession = useCallback(
    async (next: AssistSession, expiry: number, fromStorage = false) => {
      peerRef.current?.close();
      detachElm();
      sawDropRef.current = false;
      setSession(next);
      setExpiresAt(expiry);
      setError(null);
      setRestored(fromStorage);
      const nextRoom = { session: next, expiresAt: expiry };
      rememberRoom(nextRoom, onRoomChangeRef.current);
      onAssistSessionRef.current(next);
      const peer = new AssistPeer(next, (state) => {
        setLink(state);
        linkRef.current = state;
        if (state === "connected") {
          attachElm();
          onAttachedRef.current(adapterOnlineRef.current);
          if (sawDropRef.current) {
            sawDropRef.current = false;
            void emit("link_back");
          }
        }
        if (state === "reconnecting") {
          onAttachedRef.current(false);
          channelRef.current?.failAll("Канал между телефонами переподключается");
          if (!sawDropRef.current) {
            sawDropRef.current = true;
            void emit("link_lost");
          }
        }
      });
      channelRef.current = new AssistElmChannel(peer, () => undefined);
      peerRef.current = peer;
      await peer.start();
    },
    [attachElm, detachElm, emit],
  );

  useEffect(() => {
    if (suppressRestoreRef.current) {
      if (!room) suppressRestoreRef.current = false;
      return;
    }
    if (room && !session) {
      setSession(room.session);
      setExpiresAt(room.expiresAt);
    }
  }, [room, session]);

  const expiresRef = useRef(expiresAt);
  const bindSessionRef = useRef(bindSession);
  const dropRoomRef = useRef(dropRoom);
  expiresRef.current = expiresAt;
  bindSessionRef.current = bindSession;
  dropRoomRef.current = dropRoom;
  const sessionKey = session?.roomId ?? "";

  useEffect(() => {
    if (!sessionKey) {
      peerRef.current?.close();
      peerRef.current = null;
      channelRef.current = null;
      detachElm();
      return;
    }
    const current = sessionRef.current;
    if (!current) return;
    const expiry = expiresRef.current ?? Date.now() + ASSIST_ROOM_TTL_MS;
    const fromStorage = !freshRoomRef.current;
    freshRoomRef.current = false;
    let cancel = false;
    void bindSessionRef.current(current, expiry, fromStorage).catch((err: unknown) => {
      if (cancel) return;
      const status = (err as { status?: number }).status;
      if (status === 401 || status === 404) {
        dropRoomRef.current("Комната больше не действует. Создайте новую.");
        return;
      }
      setError(err instanceof Error ? err.message : "Не удалось открыть канал комнаты");
    });
    return () => {
      cancel = true;
      peerRef.current?.close();
      peerRef.current = null;
      channelRef.current = null;
      detachElm();
    };
  }, [detachElm, sessionKey]);

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
        setRoomState(snapshot.state);
        setClientHere(snapshot.members.some((member) => member.role === "client"));
        adapterOnlineRef.current = snapshot.state.adapter === "online";
        if (linkRef.current === "connected") attachElm();
        onAttachedRef.current(linkRef.current === "connected" && adapterOnlineRef.current);
        onServiceRef.current(snapshot.state.service);
        if (snapshot.expiresAt) {
          setExpiresAt(snapshot.expiresAt);
          saveAssistRoom("master", { session, expiresAt: snapshot.expiresAt });
          rememberRoom({ session, expiresAt: snapshot.expiresAt }, onRoomChangeRef.current);
          if (assistRemainingMs(snapshot.expiresAt) <= 0 || snapshot.closed) {
            dropRoom("Час комнаты истёк. Создайте новую и отправьте код ещё раз.");
          }
        }
      } catch (err) {
        if (stop) return;
        const status = (err as { status?: number }).status;
        const message = err instanceof Error ? err.message : "Комната недоступна";
        if (status === 401 || status === 404) dropRoom(message);
        else setError(message);
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), 1500);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [dropRoom, session]);

  const createRoom = async () => {
    setError(null);
    try {
      const created = await createAssistRoom();
      const expiry = Date.now() + ASSIST_ROOM_TTL_MS;
      freshRoomRef.current = true;
      setExpiresAt(expiry);
      setSession(created);
      rememberRoom({ session: created, expiresAt: expiry }, onRoomChangeRef.current);
      onAssistSessionRef.current(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось создать комнату");
    }
  };

  const liveSession = session ?? room?.session ?? null;
  const liveExpiry = expiresAt ?? room?.expiresAt ?? null;

  const chooseService = async (service: AssistService) => {
    if (!liveSession) return;
    setError(null);
    try {
      const state = await setAssistService(liveSession, service);
      setRoomState(state);
      onService(service);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось выбрать сервис");
    }
  };

  const deleteRoom = async () => {
    if (!liveSession) return;
    if (!window.confirm("Удалить комнату? Клиент будет отключён, этот код больше не сработает.")) return;
    setError(null);
    try {
      await leaveAssistRoom(liveSession);
      dropRoom("Комната удалена.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось удалить комнату");
    }
  };

  const shareCode = async () => {
    if (!liveSession) return;
    const text = `Код комнаты Subaru: ${liveSession.roomCode}`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ text });
        return;
      } catch {
        /* fall through to copy */
      }
    }
    setCopied(await copyCode(liveSession.roomCode));
  };

  const service = roomState?.service ?? null;
  const linkLabel =
    link === "connected" ? "открыт" : link === "reconnecting" ? "переподключение" : link === "connecting" ? "поднимается" : "нет";

  return (
    <div className="space-y-3">
      <section className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
        <div>
          <h2 className="text-sm font-bold text-gray-900">Удалённое подключение</h2>
          <p className="text-xs text-gray-500 leading-relaxed">
            Комната живёт час и сохраняется на этом телефоне. Можно свернуть приложение, отправить код и вернуться — клиент останется в той же комнате.
            Переподключение канала между телефонами не глушит зажигание и не отключает vLinker.
          </p>
        </div>
        {!liveSession ? (
          <button
            type="button"
            onClick={() => void createRoom()}
            className="w-full rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white"
          >
            Создать комнату
          </button>
        ) : (
          <div className="space-y-2">
            {restored && (
              <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
                Вернулись в открытую комнату.
              </p>
            )}
            <div className="flex items-center justify-between gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3">
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-wide text-gray-500">Код комнаты</div>
                <div className="font-mono text-2xl font-bold tracking-[0.18em] text-gray-900">{liveSession.roomCode}</div>
              </div>
              <div className="flex shrink-0 flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => void shareCode()}
                  className="rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white"
                >
                  Отправить
                </button>
                <button
                  type="button"
                  onClick={() => void copyCode(liveSession.roomCode).then((ok) => setCopied(ok))}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold"
                >
                  {copied ? "Скопировано" : "Копировать"}
                </button>
              </div>
            </div>
            <ul className="grid grid-cols-2 gap-2 text-xs">
              <li className="rounded-lg border border-gray-200 px-2 py-1.5">
                <AssistRoomClock expiresAt={liveExpiry} />
              </li>
              {[
                ["Клиент", clientHere ? "в комнате" : "ожидание"],
                ["Сервис", service ? assistServiceLabel(service) : "выберите ниже"],
                ["Зажигание", roomState?.ignition ? "включено" : "нет"],
                ["vLinker", roomState?.adapter === "online" ? "подключён" : "нет"],
                ["Канал", linkLabel],
              ].map(([label, value]) => (
                <li key={label} className="rounded-lg border border-gray-200 px-2 py-1.5">
                  <div className="text-gray-500">{label}</div>
                  <div className="font-semibold text-gray-900">{value}</div>
                </li>
              ))}
            </ul>
            {link === "reconnecting" && (
              <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                Канал между телефонами восстанавливается. Запись в машину на это время не обрывается: vLinker клиента остаётся подключённым, повторите действие, если команда не успела завершиться.
              </p>
            )}
            <button
              type="button"
              onClick={() => peerRef.current?.ensureConnected()}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-800"
            >
              Переподключить канал
            </button>
            <button
              type="button"
              onClick={() => void deleteRoom()}
              className="w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700"
            >
              Удалить комнату
            </button>
          </div>
        )}
        {liveSession && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-800">Сервис выбираете вы. Клиент только включает зажигание и vLinker.</p>
            <div className="grid grid-cols-2 gap-2">
              {SERVICES.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => void chooseService(item)}
                  className={`rounded-xl border px-3 py-2.5 text-left text-xs font-semibold ${
                    service === item ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white text-gray-900"
                  }`}
                >
                  {assistServiceLabel(item)}
                </button>
              ))}
            </div>
            {service === "celsius" && (
              <p className="text-[11px] leading-relaxed text-gray-500">
                Ниже то же меню приборки и EyeSight, что на вкладке °F → °C: считанные DID видны, писать можно выбранные DID или весь профиль. EyeSight — все DID или только регион. Чтение идёт тем же списком, но каждый запрос проходит через телефон клиента, поэтому полный проход длиннее, чем с вашим vLinker.
              </p>
            )}
            {service === "diag" && (
              <p className="text-[11px] leading-relaxed text-gray-500">
                Ниже тот же опрос блоков, что в Subaru Diagnostics. Клиент видит только статус, без кодов ошибок.
              </p>
            )}
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-xs font-medium text-red-800">{error}</div>
        )}
      </section>
    </div>
  );
}
