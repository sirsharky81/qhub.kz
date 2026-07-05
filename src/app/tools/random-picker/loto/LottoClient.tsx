"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  LOTTO_INTERVAL_MAX,
  LOTTO_INTERVAL_MIN,
  LOTTO_POOL_MAX,
  DEFAULT_LOTTO_SETTINGS,
  createNewGame,
  drawBarrel,
  loadLottoState,
  saveLottoState,
  lottoDrawSpeechText,
  speakLottoNumber,
  detectWinsAmongPlayers,
  LOTTO_WIN_LABELS,
  type LottoGameState,
  type LottoPlayer,
  type LottoSettings,
  type LottoWinRules,
} from "@/lib/random-picker/lotto";
import { PrivacyBanner } from "@/app/tools/file-converter/components/PrivacyBanner";
import { PickerButton, PickerSection } from "../components/PickerButton";
import { LottoParticipants } from "./LottoParticipants";
import { LottoTicketCard } from "./LottoTicketCard";
import { LottoJoin } from "./LottoJoin";
import { CODE_SCANNER_SIMPLE_URL } from "@/lib/code-scanner/url-utils";
import {
  createLottoRoomApi,
  deleteLottoRoomApi,
  loadParticipantSession,
  parseJoinSearchParams,
  syncLottoRoomApi,
} from "@/lib/lotto-rooms/client";
import type { LottoRoomPlayer } from "@/lib/lotto-rooms/types";

type PrePanelTab = "settings" | "rules" | "participants" | "join";

function clampInterval(n: number): number {
  return Math.min(LOTTO_INTERVAL_MAX, Math.max(LOTTO_INTERVAL_MIN, n));
}

function IntervalStepper({
  value,
  onDecrease,
  onIncrease,
  label = "Интервал между бочками",
}: {
  value: number;
  onDecrease: () => void;
  onIncrease: () => void;
  label?: string;
}) {
  return (
    <div>
      <span className="text-[11px] text-gray-500 uppercase tracking-wide">{label}</span>
      <div className="flex items-center gap-3 mt-1.5">
        <PickerButton
          variant="secondary"
          onClick={onDecrease}
          disabled={value <= LOTTO_INTERVAL_MIN}
          ariaLabel="Уменьшить интервал"
        >
          −
        </PickerButton>
        <span className="text-sm font-semibold tabular-nums min-w-[4.5rem] text-center">
          {value} сек
        </span>
        <PickerButton
          variant="secondary"
          onClick={onIncrease}
          disabled={value >= LOTTO_INTERVAL_MAX}
          ariaLabel="Увеличить интервал"
        >
          +
        </PickerButton>
      </div>
    </div>
  );
}

function LottoRules() {
  return (
    <div className="space-y-3 text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
      <p>
        Это приложение — электронный ведущий: оно случайно выдаёт бочки с числами от 1 до 90 без
        повторений. Карточки можно сформировать на вкладке «Участники» или подготовить на бумаге.
      </p>

      <div>
        <p className="font-semibold text-gray-800 dark:text-gray-200 mb-1">Участники</p>
        <ul className="list-disc pl-4 space-y-0.5">
          <li>Играют от 2 человек, верхнего предела нет — сколько поместится за столом.</li>
          <li>Один человек ведёт игру и следит за выпавшими числами (можно включить озвучку).</li>
        </ul>
      </div>

      <div>
        <p className="font-semibold text-gray-800 dark:text-gray-200 mb-1">Карточка</p>
        <ul className="list-disc pl-4 space-y-0.5">
          <li>На классической карточке 3 строки по 5 чисел — всего 15 чисел из диапазона 1–90.</li>
          <li>Числа в строке не повторяются; в одном столбце обычно числа из одного десятка.</li>
          <li>Дома можно упростить: например, 2 строки по 5 чисел или свой формат — главное, договориться до начала.</li>
        </ul>
      </div>

      <div>
        <p className="font-semibold text-gray-800 dark:text-gray-200 mb-1">Ход игры</p>
        <ol className="list-decimal pl-4 space-y-0.5">
          <li>Нажмите «Начать игру» — выпадет первая бочка.</li>
          <li>Игроки зачёркивают совпавшие числа на своих карточках.</li>
          <li>Следующие бочки выходят автоматически через заданный интервал.</li>
          <li>Если игроки не успевают — увеличьте интервал кнопкой «+» прямо во время игры.</li>
        </ol>
      </div>

      <div>
        <p className="font-semibold text-gray-800 dark:text-gray-200 mb-1">Как выиграть</p>
        <ul className="list-disc pl-4 space-y-0.5">
          <li>
            <strong className="text-gray-700 dark:text-gray-300">Одна линия</strong> — все числа в
            одной строке карточки.
          </li>
          <li>
            <strong className="text-gray-700 dark:text-gray-300">Две линии</strong> — две заполненные
            строки.
          </li>
          <li>
            <strong className="text-gray-700 dark:text-gray-300">Полная карточка</strong> — все 15 чисел
            на карточке.
          </li>
        </ul>
        <p className="mt-1.5">
          Порядок розыгрыша призов (только линия или сначала линия, потом полная карточка) лучше
          согласовать до старта.
        </p>
      </div>

      <p className="text-[11px] text-gray-500 dark:text-gray-500">
        Игра заканчивается, когда все 90 бочек выпали или ведущий нажимает «Завершить».
      </p>
    </div>
  );
}

export default function LottoClient() {
  const [game, setGame] = useState<LottoGameState>(() => {
    const stored = loadLottoState();
    if (
      stored &&
      (stored.drawn.length > 0 ||
        stored.status !== "idle" ||
        stored.cardsGenerated ||
        stored.players.length > 0 ||
        Boolean(stored.network))
    ) {
      return stored;
    }
    return createNewGame(DEFAULT_LOTTO_SETTINGS);
  });
  const [fullscreen, setFullscreen] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const [prePanelTab, setPrePanelTab] = useState<PrePanelTab>(() => {
    if (typeof window === "undefined") return "settings";
    if (loadParticipantSession() || parseJoinSearchParams(window.location.search)) {
      return "join";
    }
    return "settings";
  });
  const rootRef = useRef<HTMLDivElement>(null);
  const drawingRef = useRef(false);
  const gameRef = useRef(game);
  gameRef.current = game;

  const { settings, status, drawn, remaining, current, countdownSec, players, winRules, cardsGenerated, activeWinAlert, network } = game;
  const isActive = status === "playing" || status === "paused";
  const isPaused = status === "paused";
  const isPlaying = status === "playing";
  const isFinished = status === "finished" || remaining.length === 0;

  useEffect(() => {
    saveLottoState(game);
  }, [game]);

  useEffect(() => {
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const updateSettings = useCallback((patch: Partial<LottoSettings>) => {
    setGame((g) => ({
      ...g,
      settings: { ...g.settings, ...patch },
      countdownSec: patch.intervalSec ?? g.countdownSec,
    }));
  }, []);

  const adjustInterval = useCallback((delta: -1 | 1) => {
    setGame((g) => {
      const next = clampInterval(g.settings.intervalSec + delta);
      if (next === g.settings.intervalSec) return g;

      if (g.status === "playing" || g.status === "paused") {
        return {
          ...g,
          settings: { ...g.settings, intervalSec: next },
          countdownSec: Math.max(1, g.countdownSec + delta),
        };
      }

      return {
        ...g,
        settings: { ...g.settings, intervalSec: next },
        countdownSec: next,
      };
    });
  }, []);

  const performDraw = useCallback(async () => {
    if (drawingRef.current) return;
    const g = gameRef.current;
    if (g.status !== "playing" || g.remaining.length === 0) return;

    drawingRef.current = true;
    const { number, newRemaining } = drawBarrel(g.remaining);
    const newDrawn = [...g.drawn, number];
    let nextPlayers = g.players;
    let winAlert = null;
    let nextStatus: LottoGameState["status"] =
      newRemaining.length === 0 ? "finished" : g.status;

    if (g.cardsGenerated && g.players.length >= 2) {
      const winResult = detectWinsAmongPlayers(g.players, newDrawn, g.winRules);
      nextPlayers = winResult.players;
      winAlert = winResult.alert;
      if (winAlert && g.winRules.pauseOnWin && nextStatus === "playing") {
        nextStatus = "paused";
      }
    }

    setGame({
      ...g,
      current: number,
      drawn: newDrawn,
      remaining: newRemaining,
      status: nextStatus,
      players: nextPlayers,
      activeWinAlert: winAlert,
      countdownSec: g.settings.intervalSec,
    });

    try {
      if (g.settings.voiceEnabled) {
        await speakLottoNumber(
          lottoDrawSpeechText(
            number,
            g.settings.voiceMode,
            winAlert
              ? { playerName: winAlert.playerName, winType: winAlert.winType }
              : null,
          ),
        );
      }
    } finally {
      drawingRef.current = false;
    }
  }, []);

  const toRoomPlayers = useCallback((list: LottoPlayer[]): LottoRoomPlayer[] => {
    return list.map((p) => ({
      id: p.id,
      name: p.name,
      ticket: p.ticket,
      wins: p.wins,
      joinToken: p.joinToken ?? "",
      joinCode: p.joinCode ?? "",
      joined: p.joined ?? false,
      left: p.left ?? false,
    }));
  }, []);

  const handlePlayersChange = useCallback((nextPlayers: LottoPlayer[]) => {
    setGame((g) => ({
      ...g,
      players: nextPlayers,
      cardsGenerated: false,
      activeWinAlert: null,
      network: null,
    }));
  }, []);

  const handleWinRulesChange = useCallback((rules: LottoWinRules) => {
    setGame((g) => ({ ...g, winRules: rules }));
  }, []);

  const handleCardsGenerated = useCallback(
    async (nextPlayers: LottoPlayer[]) => {
      const g = gameRef.current;
      const data = await createLottoRoomApi({
        players: nextPlayers,
        settings: g.settings,
        winRules: g.winRules,
        cardsGenerated: true,
      });
      const merged = nextPlayers.map((p) => {
        const rp = data.players.find((x) => x.id === p.id);
        return {
          ...p,
          joinCode: rp?.joinCode,
          joinToken: rp?.joinToken,
          joined: false,
          left: false,
        };
      });
      setGame((prev) => ({
        ...prev,
        players: merged,
        cardsGenerated: true,
        activeWinAlert: null,
        network: { roomCode: data.roomCode, hostSecret: data.hostSecret },
      }));
    },
    [],
  );

  useEffect(() => {
    const net = network;
    if (!net?.roomCode || !net.hostSecret || !cardsGenerated) return;

    const t = window.setTimeout(() => {
      const g = gameRef.current;
      void syncLottoRoomApi(net.roomCode, net.hostSecret, {
        status,
        settings,
        winRules,
        drawn,
        remaining,
        current,
        countdownSec: g.countdownSec,
        cardsGenerated,
        activeWinAlert,
        players: toRoomPlayers(players),
      })
        .then((res) => {
          setGame((g) => {
            if (!g.network || g.network.roomCode !== net.roomCode) return g;
            const statusById = new Map(res.players.map((p) => [p.id, p]));
            const nextPlayers = g.players.map((p) => {
              const remote = statusById.get(p.id);
              if (!remote) return p;
              if (p.joined === remote.joined && p.left === remote.left) return p;
              return { ...p, joined: remote.joined, left: remote.left };
            });
            if (nextPlayers.every((p, i) => p === g.players[i])) return g;
            return { ...g, players: nextPlayers };
          });
        })
        .catch(() => {});
    }, 400);

    return () => clearTimeout(t);
  }, [
    network,
    cardsGenerated,
    status,
    settings,
    winRules,
    drawn,
    remaining,
    current,
    activeWinAlert,
    players,
    toRoomPlayers,
  ]);

  const startGame = async () => {
    const g = gameRef.current;
    const base = createNewGame(g.settings);
    const { number, newRemaining } = drawBarrel(base.remaining);
    const resetPlayers = g.cardsGenerated
      ? g.players.map((p) => ({ ...p, wins: [] }))
      : g.players;

    let initialPlayers = resetPlayers;
    let initialAlert = null;
    if (g.cardsGenerated && g.players.length >= 2) {
      const winResult = detectWinsAmongPlayers(resetPlayers, [number], g.winRules);
      initialPlayers = winResult.players;
      initialAlert = winResult.alert;
    }

    const initialStatus =
      initialAlert && g.winRules.pauseOnWin ? "paused" : "playing";

    setGame({
      ...base,
      status: initialStatus,
      current: number,
      drawn: [number],
      remaining: newRemaining,
      countdownSec: g.settings.intervalSec,
      players: initialPlayers,
      winRules: g.winRules,
      cardsGenerated: g.cardsGenerated,
      activeWinAlert: initialAlert,
      network: g.network,
    });

    if (g.settings.voiceEnabled) {
      await speakLottoNumber(
        lottoDrawSpeechText(
          number,
          g.settings.voiceMode,
          initialAlert
            ? { playerName: initialAlert.playerName, winType: initialAlert.winType }
            : null,
        ),
      );
    }
  };

  const togglePause = () => {
    setGame((g) => {
      if (g.status === "paused") {
        return {
          ...g,
          status: "playing",
          activeWinAlert: null,
          countdownSec: g.settings.intervalSec,
        };
      }
      return { ...g, status: "paused" };
    });
  };

  const handleNextNow = () => {
    if (remaining.length === 0 || status === "paused") return;
    void performDraw();
  };

  const handleFinish = () => {
    setGame((g) => ({ ...g, status: "finished" }));
  };

  const handleNewGame = () => {
    setConfirmNew(false);
    const net = gameRef.current.network;
    if (net?.roomCode && net.hostSecret) {
      void deleteLottoRoomApi(net.roomCode, net.hostSecret);
    }
    setGame(createNewGame(settings));
  };

  const toggleFullscreen = async () => {
    if (!rootRef.current) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await rootRef.current.requestFullscreen();
    }
  };

  useEffect(() => {
    if (!isPlaying || remaining.length === 0) return;
    const id = window.setInterval(() => {
      setGame((g) => {
        if (g.status !== "playing" || g.remaining.length === 0) return g;
        if (g.countdownSec > 0) {
          return { ...g, countdownSec: g.countdownSec - 1 };
        }
        return g;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [isPlaying, remaining.length]);

  useEffect(() => {
    if (!isPlaying || remaining.length === 0 || countdownSec > 0) return;
    void performDraw();
  }, [isPlaying, remaining.length, countdownSec, performDraw]);

  const showPrePanel = !fullscreen;
  const trackingEnabled = cardsGenerated && players.length >= 2;

  return (
    <div ref={rootRef} className="flex flex-col flex-1 min-h-0 bg-gray-50 dark:bg-gray-950">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">
          {!fullscreen && (
            <>
              <Link
                href="/tools/random-picker"
                className="inline-flex text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                ← Генератор случайных чисел
              </Link>
              <div className="space-y-1">
                <h1 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">
                  Русское лото
                </h1>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Электронный ведущий для игры в лото. Случайные бочки 1–90 без повторений.
                </p>
                <PrivacyBanner compact />
              </div>
            </>
          )}

          {showPrePanel && (
            <PickerSection
              tabs={[
                { id: "settings", label: "Игра" },
                { id: "rules", label: "Правила игры", shortLabel: "Правила" },
                { id: "participants", label: "Участники" },
                { id: "join", label: "Присоединиться", shortLabel: "Войти" },
              ]}
              activeTab={prePanelTab}
              onTabChange={(id) => setPrePanelTab(id as PrePanelTab)}
            >
              {prePanelTab === "settings" ? (
                <div className="space-y-4">
                  {isActive ? (
                    <p className="text-xs text-gray-500">
                      Игра идёт. Скорость выпадения меняется на панели бочки. Озвучка и интервал
                      зафиксированы до новой игры.
                    </p>
                  ) : (
                    <>
                      <IntervalStepper
                        value={settings.intervalSec}
                        onDecrease={() => adjustInterval(-1)}
                        onIncrease={() => adjustInterval(1)}
                      />

                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={settings.voiceEnabled}
                          onChange={(e) => updateSettings({ voiceEnabled: e.target.checked })}
                          className="rounded"
                        />
                        <span className="text-xs text-gray-700 dark:text-gray-300">Озвучивать числа</span>
                      </label>

                      {settings.voiceEnabled && (
                        <fieldset className="space-y-1.5">
                          <legend className="text-[11px] text-gray-500 uppercase tracking-wide">
                            Текст озвучки
                          </legend>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="voice-mode"
                              checked={settings.voiceMode === "number"}
                              onChange={() => updateSettings({ voiceMode: "number" })}
                            />
                            <span className="text-xs text-gray-600 dark:text-gray-400">Только число</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="voice-mode"
                              checked={settings.voiceMode === "barrel"}
                              onChange={() => updateSettings({ voiceMode: "barrel" })}
                            />
                            <span className="text-xs text-gray-600 dark:text-gray-400">Бочка номер X</span>
                          </label>
                        </fieldset>
                      )}

                      {trackingEnabled && (
                        <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
                          Карточки сформированы для {players.length} игроков
                          {network
                            ? ` — сетевая комната ${network.roomCode}`
                            : " — выигрыши отслеживаются автоматически"}
                          .
                        </p>
                      )}

                      <PickerButton onClick={startGame} className="w-full">
                        Начать игру
                      </PickerButton>
                    </>
                  )}
                </div>
              ) : prePanelTab === "rules" ? (
                <LottoRules />
              ) : prePanelTab === "join" ? (
                <LottoJoin />
              ) : (
                <LottoParticipants
                  players={players}
                  winRules={winRules}
                  cardsGenerated={cardsGenerated}
                  drawn={drawn}
                  isActive={isActive}
                  roomCode={network?.roomCode ?? null}
                  onPlayersChange={handlePlayersChange}
                  onWinRulesChange={handleWinRulesChange}
                  onCardsGenerated={handleCardsGenerated}
                  onStartGame={startGame}
                />
              )}
            </PickerSection>
          )}

          {isActive || isFinished ? (
            <div className="space-y-4">
              <div className="flex flex-col items-center py-4 sm:py-8 w-full">
                {activeWinAlert ? (
                  <div className="w-full max-w-md space-y-3 text-center px-2">
                    <p className="text-[clamp(1.5rem,6vw,2rem)] font-bold text-emerald-600 dark:text-emerald-400">
                      Выигрыш!
                    </p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {activeWinAlert.playerName}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {LOTTO_WIN_LABELS[activeWinAlert.winType]}
                    </p>
                    {current !== null && (
                      <p className="text-xs text-gray-500 tabular-nums">
                        Бочка: <strong className="text-amber-700 dark:text-amber-300">{current}</strong>
                      </p>
                    )}
                    <LottoTicketCard
                      ticket={activeWinAlert.ticket}
                      drawn={drawn}
                      highlightRows={activeWinAlert.winningRowIndices}
                    />
                  </div>
                ) : (
                  <div
                    className="relative flex items-center justify-center w-[min(92vw,320px)] aspect-square rounded-full border-[6px] border-amber-700/80 bg-gradient-to-b from-amber-100 to-amber-200 dark:from-amber-900/40 dark:to-amber-950 shadow-xl"
                    aria-live="polite"
                    aria-atomic="true"
                  >
                    <div className="absolute inset-3 rounded-full border-2 border-amber-800/30" />
                    <span className="text-[clamp(4rem,22vw,6rem)] font-bold tabular-nums text-amber-950 dark:text-amber-50 leading-none">
                      {current ?? "—"}
                    </span>
                  </div>
                )}

                {isActive && !isFinished && remaining.length > 0 && (
                  <div className="mt-4 flex flex-col items-center gap-3">
                    {isPaused && (
                      <p className="text-sm font-medium text-amber-700 dark:text-amber-300 text-center">
                        Игра на паузе — проверьте выигрыш и нажмите «Продолжить»
                      </p>
                    )}
                    {isPlaying && (
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Следующая бочка через{" "}
                        <strong className="tabular-nums text-gray-900 dark:text-gray-100">
                          {countdownSec}
                        </strong>{" "}
                        сек
                      </p>
                    )}
                    <IntervalStepper
                      value={settings.intervalSec}
                      onDecrease={() => adjustInterval(-1)}
                      onIncrease={() => adjustInterval(1)}
                      label="Скорость выпадения"
                    />
                  </div>
                )}

                {isFinished && (
                  <div className="mt-4 text-center space-y-1">
                    <p className="text-lg font-semibold text-emerald-700 dark:text-emerald-400">
                      Все бочки выданы
                    </p>
                    <p className="text-sm text-gray-500 tabular-nums">
                      {drawn.length} из {LOTTO_POOL_MAX}
                    </p>
                  </div>
                )}

                <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-gray-500 tabular-nums">
                  <span>
                    Выпало: <strong className="text-gray-800 dark:text-gray-200">{drawn.length}</strong> из{" "}
                    {LOTTO_POOL_MAX}
                  </span>
                  <span>
                    Осталось: <strong className="text-gray-800 dark:text-gray-200">{remaining.length}</strong>
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 justify-center">
                {isActive && !isFinished && (
                  <>
                    <PickerButton
                      variant={isPaused ? "primary" : "secondary"}
                      onClick={togglePause}
                      ariaLabel={isPaused ? "Продолжить игру" : "Поставить на паузу"}
                      className={
                        isPaused
                          ? "ring-2 ring-amber-400 shadow-md dark:ring-amber-500"
                          : undefined
                      }
                    >
                      {isPaused ? "▶ Продолжить" : "⏸ Пауза"}
                    </PickerButton>
                    <PickerButton
                      variant="secondary"
                      onClick={handleNextNow}
                      disabled={isPaused}
                      disabledReason="Сначала нажмите «Продолжить»"
                    >
                      Следующая сейчас
                    </PickerButton>
                    <PickerButton variant="ghost" onClick={handleFinish}>
                      Завершить
                    </PickerButton>
                  </>
                )}
                <PickerButton variant="ghost" onClick={toggleFullscreen}>
                  {fullscreen ? "⊡ Выйти" : "⛶ Полный экран"}
                </PickerButton>
                {isFinished && (
                  <PickerButton onClick={() => setConfirmNew(true)}>Начать новую игру</PickerButton>
                )}
                {!isFinished && isActive && (
                  <PickerButton variant="ghost" onClick={() => setConfirmNew(true)}>
                    Новая игра
                  </PickerButton>
                )}
              </div>

              <PickerSection title="История выпадений">
                {drawn.length === 0 ? (
                  <p className="text-xs text-gray-400">Пока ничего не выпало</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
                    {drawn.map((n, i) => {
                      const isLast = i === drawn.length - 1;
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
                )}
              </PickerSection>
            </div>
          ) : null}
        </div>
      </div>

      {confirmNew && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40"
          role="dialog"
          aria-modal="true"
          onClick={() => setConfirmNew(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 space-y-3 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Новая игра?</h4>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Текущий прогресс будет потерян.
            </p>
            <div className="flex flex-col gap-2">
              <PickerButton onClick={handleNewGame} className="w-full">
                Начать заново
              </PickerButton>
              <PickerButton variant="ghost" onClick={() => setConfirmNew(false)} className="w-full">
                Отмена
              </PickerButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
