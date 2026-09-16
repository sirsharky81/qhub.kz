"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isIOSDevice } from "@/lib/platform/device";
import { TIME_CONTROLS, type ChessAiLevel, type ChessColorPref } from "@/lib/games/chess/types";

export function ChessMainMenu({
  onStartOffline,
  onCreateRoom,
  onJoinByCode,
  onCopyRoomCode,
  onShareRoomCode,
  onLeaveRoom,
  onCloseRoom,
  playerName,
  setPlayerName,
  joinCode,
  setJoinCode,
  onlineRoomCode,
  isRoomOwner,
  onlineStatus,
  onlinePlayersCount,
  initialTab,
  aiLevel,
  setAiLevel,
  colorPref,
  setColorPref,
  timeControlId,
  setTimeControlId,
}: {
  onStartOffline: () => void;
  onCreateRoom: () => void;
  onJoinByCode: () => void;
  onCopyRoomCode: () => void;
  onShareRoomCode: () => void;
  onLeaveRoom: () => void;
  onCloseRoom: () => void;
  playerName: string;
  setPlayerName: (value: string) => void;
  joinCode: string;
  setJoinCode: (value: string) => void;
  onlineRoomCode: string | null;
  isRoomOwner: boolean;
  onlineStatus: "open" | "playing" | "finished" | null;
  onlinePlayersCount: number;
  initialTab?: "offline" | "create-online" | "join-online";
  aiLevel: ChessAiLevel;
  setAiLevel: (value: ChessAiLevel) => void;
  colorPref: ChessColorPref;
  setColorPref: (value: ChessColorPref) => void;
  timeControlId: string;
  setTimeControlId: (value: string) => void;
}) {
  const [mainTab, setMainTab] = useState<"offline" | "create-online" | "join-online">(initialTab ?? "offline");
  const focusTimersRef = useRef<number[]>([]);
  const cleanupFocusTrackingRef = useRef<(() => void) | null>(null);

  const clearFocusTimers = useCallback(() => {
    focusTimersRef.current.forEach((id) => window.clearTimeout(id));
    focusTimersRef.current = [];
  }, []);

  const clearFocusTracking = useCallback(() => {
    cleanupFocusTrackingRef.current?.();
    cleanupFocusTrackingRef.current = null;
    clearFocusTimers();
  }, [clearFocusTimers]);

  useEffect(() => clearFocusTracking, [clearFocusTracking]);

  const scrollInputIntoView = useCallback((input: HTMLInputElement) => {
    const scrollContainer = input.closest("[data-chess-scroll='true']");
    if (scrollContainer instanceof HTMLElement) {
      const containerRect = scrollContainer.getBoundingClientRect();
      const inputRect = input.getBoundingClientRect();
      scrollContainer.scrollTo({
        top: scrollContainer.scrollTop + (inputRect.top - containerRect.top) - 88,
        behavior: "auto",
      });
      return;
    }
    input.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
  }, []);

  const keepInputVisible = useCallback(
    (input: HTMLInputElement) => {
      clearFocusTracking();
      scrollInputIntoView(input);
      if (!isIOSDevice() || !window.visualViewport) return;
      const vv = window.visualViewport;
      const handleViewportShift = () => scrollInputIntoView(input);
      vv.addEventListener("resize", handleViewportShift);
      vv.addEventListener("scroll", handleViewportShift);
      cleanupFocusTrackingRef.current = () => {
        vv.removeEventListener("resize", handleViewportShift);
        vv.removeEventListener("scroll", handleViewportShift);
      };
    },
    [clearFocusTracking, scrollInputIntoView],
  );

  const colorButtons: { id: ChessColorPref; label: string }[] = [
    { id: "w", label: "Белые" },
    { id: "b", label: "Чёрные" },
    { id: "random", label: "Случайно" },
  ];

  return (
    <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900 md:mx-auto md:max-w-3xl">
      <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Главное меню</h2>
      <div className="grid grid-cols-3 gap-1.5">
        {(
          [
            ["offline", "ИИ"],
            ["create-online", "Создать онлайн"],
            ["join-online", "Присоединиться"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setMainTab(id)}
            className={`rounded-lg border px-2 py-1.5 text-xs font-medium ${
              mainTab === id
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-gray-300 dark:border-gray-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <section className="space-y-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
        {mainTab === "offline" ? (
          <>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Игра против ИИ</h3>
            <label className="block text-xs text-gray-600 dark:text-gray-300">
              Сложность: {aiLevel}/10
              <input
                type="range"
                min={1}
                max={10}
                value={aiLevel}
                onChange={(e) => setAiLevel(Number(e.target.value) as ChessAiLevel)}
                className="mt-1 w-full"
              />
              <span className="flex justify-between text-[10px] text-gray-400">
                <span>Легко</span>
                <span>Сложно</span>
              </span>
            </label>
          </>
        ) : (
          <input
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            onFocus={(e) => keepInputVisible(e.currentTarget)}
            onBlur={clearFocusTracking}
            placeholder="Ваше имя"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
          />
        )}

        {(!onlineRoomCode || mainTab === "offline") && (
          <>
            <div className="grid grid-cols-3 gap-1.5">
              {colorButtons.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setColorPref(item.id)}
                  className={`rounded-lg border px-2 py-1.5 text-xs font-medium ${
                    colorPref === item.id
                      ? "border-emerald-700 bg-emerald-700 text-white"
                      : "border-gray-300 dark:border-gray-700"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {TIME_CONTROLS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTimeControlId(item.id)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                    timeControlId === item.id
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-gray-300 dark:border-gray-700"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </>
        )}

        {mainTab === "offline" ? (
          <button
            type="button"
            onClick={onStartOffline}
            className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Начать
          </button>
        ) : onlineRoomCode ? (
          <div className="space-y-2">
            <p className="text-xs text-gray-600 dark:text-gray-400">
              {isRoomOwner ? "Вы владелец комнаты" : "Вы участник комнаты"}
            </p>
            <div className="rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-700">
              Код комнаты: <span className="font-semibold tracking-wide">{onlineRoomCode}</span>
            </div>
            {onlineStatus === "open" && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                Ожидание соперника: {onlinePlayersCount}/2. Партия начнётся автоматически.
              </p>
            )}
            <button type="button" onClick={onCopyRoomCode} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700">
              Скопировать код комнаты
            </button>
            <button type="button" onClick={onShareRoomCode} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700">
              Отправить код
            </button>
            <button type="button" onClick={onLeaveRoom} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700">
              Покинуть комнату
            </button>
            {isRoomOwner && (
              <button
                type="button"
                onClick={onCloseRoom}
                className="w-full rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:text-red-300"
              >
                Закрыть комнату
              </button>
            )}
          </div>
        ) : mainTab === "create-online" ? (
          <button
            type="button"
            onClick={onCreateRoom}
            className="w-full rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-900"
          >
            Создать комнату
          </button>
        ) : (
          <div className="space-y-2">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              onFocus={(e) => keepInputVisible(e.currentTarget)}
              onBlur={clearFocusTracking}
              placeholder="Код комнаты"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-950"
            />
            <button
              type="button"
              onClick={onJoinByCode}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700"
            >
              Присоединиться к игре
            </button>
          </div>
        )}
      </section>
    </section>
  );
}
