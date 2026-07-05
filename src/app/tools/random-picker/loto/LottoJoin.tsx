"use client";

import { useCallback, useEffect, useState } from "react";
import {
  clearParticipantSession,
  joinLottoRoomApi,
  leaveLottoRoomApi,
  loadParticipantSession,
  parseRoomCodeSearchParam,
  pollLottoRoomApi,
  reconnectLottoRoomApi,
  type ParticipantSession,
} from "@/lib/lotto-rooms/client";
import type { LottoParticipantView } from "@/lib/lotto-rooms/types";
import { LOTTO_POOL_MAX } from "@/lib/random-picker/lotto";
import { LOTTO_WIN_LABELS } from "@/lib/random-picker/lotto-tickets";
import { PickerButton } from "../components/PickerButton";
import { LottoTicketCard } from "./LottoTicketCard";
import { getCompletedLineIndices } from "@/lib/random-picker/lotto-tickets";

export function LottoJoin() {
  const [session, setSession] = useState<ParticipantSession | null>(null);
  const [view, setView] = useState<LottoParticipantView | null>(null);
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [playerNameInput, setPlayerNameInput] = useState("Игрок 1");
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [version, setVersion] = useState(0);

  const connect = useCallback(async (next: ParticipantSession) => {
    setJoining(true);
    setError(null);
    try {
      const data = await pollLottoRoomApi(next, 0);
      if (data) {
        setView(data);
        setVersion(data.room.version);
      }
      setSession(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка подключения");
      clearParticipantSession();
      setSession(null);
    } finally {
      setJoining(false);
    }
  }, []);

  useEffect(() => {
    const stored = loadParticipantSession();
    if (stored) {
      void reconnectLottoRoomApi(stored.roomCode, stored.playerId, stored.joinToken)
        .then(connect)
        .catch(() => clearParticipantSession());
    }
    const roomFromUrl = parseRoomCodeSearchParam(window.location.search);
    if (roomFromUrl) {
      setRoomCodeInput(roomFromUrl);
    }
  }, [connect]);

  useEffect(() => {
    if (!session) return;
    const id = window.setInterval(() => {
      void (async () => {
        try {
          const data = await pollLottoRoomApi(session, version);
          if (data) {
            setView(data);
            setVersion(data.room.version);
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : "Соединение потеряно");
        }
      })();
    }, 1500);
    return () => clearInterval(id);
  }, [session, version]);

  const handleJoin = async () => {
    const room = roomCodeInput.trim().toUpperCase();
    const name = playerNameInput.trim();
    if (!room || !name) return;
    setJoining(true);
    setError(null);
    try {
      const s = await joinLottoRoomApi(room, name);
      await connect(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось присоединиться");
    } finally {
      setJoining(false);
    }
  };

  const handleLeave = async () => {
    if (!session) return;
    try {
      await leaveLottoRoomApi(session);
    } catch {
      clearParticipantSession();
    }
    setSession(null);
    setView(null);
    setVersion(0);
  };

  if (session && view && view.player.ticket) {
    const { room, player } = view;
    const ticket = view.player.ticket;
    const isPaused = room.status === "paused";
    const highlightRows = room.activeWinAlert?.playerId === player.id
      ? room.activeWinAlert.winningRowIndices
      : getCompletedLineIndices(ticket, room.drawn);
    const isOwnWin = room.activeWinAlert?.playerId === player.id;
    const otherWin = room.activeWinAlert && !isOwnWin ? room.activeWinAlert : null;

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{player.name}</p>
            <p className="text-[11px] text-gray-500">
              Комната <span className="font-mono">{room.roomCode}</span>
            </p>
          </div>
          <PickerButton variant="ghost" onClick={() => void handleLeave()}>
            Покинуть игру
          </PickerButton>
        </div>

        {room.status === "idle" && (
          <p className="text-xs text-gray-500">
            Ожидание старта — ведущий ещё не начал игру. Игроков в комнате:{" "}
            <strong>{room.players.filter((p) => p.joined && !p.left).length}</strong>.
          </p>
        )}

        {room.status !== "idle" && (
          <div className="flex flex-col items-center gap-2 py-2">
            <p className="text-[11px] uppercase tracking-wide text-gray-500">Выпала бочка</p>
            <span className="text-5xl font-bold tabular-nums text-amber-700 dark:text-amber-300">
              {room.current ?? "—"}
            </span>
            {isPaused && (
              <p className="text-xs font-medium text-amber-700 dark:text-amber-300 text-center">
                {otherWin
                  ? `Игра на паузе — выигрыш у ${otherWin.playerName}`
                  : "Игра на паузе — проверьте выигрыш"}
              </p>
            )}
          </div>
        )}

        {isOwnWin && room.activeWinAlert && (
          <div className="rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 p-3 text-center space-y-1">
            <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">Выигрыш!</p>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              {LOTTO_WIN_LABELS[room.activeWinAlert.winType]}
            </p>
          </div>
        )}

        {otherWin && (
          <div className="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3 text-center space-y-1">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
              Выигрыш у {otherWin.playerName}
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              {LOTTO_WIN_LABELS[otherWin.winType]}
            </p>
          </div>
        )}

        <LottoTicketCard ticket={ticket} drawn={room.drawn} highlightRows={highlightRows} />

        {room.drawn.length > 0 && (
          <div className="space-y-2 pt-1 border-t border-gray-100 dark:border-gray-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] text-gray-500 uppercase tracking-wide">Выпавшие бочки</span>
              <span className="text-xs text-gray-600 dark:text-gray-400 tabular-nums">
                <strong className="text-gray-800 dark:text-gray-200">{room.drawn.length}</strong> из{" "}
                {LOTTO_POOL_MAX}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
              {room.drawn.map((n, i) => {
                const isLast = i === room.drawn.length - 1;
                return (
                  <span
                    key={`${n}-${i}`}
                    className={`inline-flex items-center justify-center min-w-[2.25rem] h-8 px-1.5 rounded-lg text-xs font-semibold tabular-nums ${
                      isLast
                        ? "bg-amber-500 text-white ring-2 ring-amber-300"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                    }`}
                  >
                    {n}
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
        Введите код комнаты и ваше имя. После входа ожидайте старта игры от создателя комнаты.
      </p>
      <div className="space-y-2">
        <label className="block text-[11px] text-gray-500 uppercase tracking-wide">Код комнаты</label>
        <input
          type="text"
          value={roomCodeInput}
          onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
          placeholder="ABC123"
          className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm font-mono uppercase"
        />
      </div>
      <div className="space-y-2">
        <label className="block text-[11px] text-gray-500 uppercase tracking-wide">Имя игрока</label>
        <input
          type="text"
          value={playerNameInput}
          onChange={(e) => setPlayerNameInput(e.target.value)}
          placeholder="Игрок 1"
          className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
        />
      </div>
      {error && <p className="text-[11px] text-red-600 dark:text-red-400">{error}</p>}
      <PickerButton
        onClick={() => void handleJoin()}
        className="w-full whitespace-normal break-words leading-tight"
        disabled={joining || !roomCodeInput.trim() || !playerNameInput.trim()}
      >
        {joining ? "Подключение…" : "Присоединиться"}
      </PickerButton>
    </div>
  );
}
