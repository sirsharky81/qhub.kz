"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { GameEngine } from "@/lib/games/core/engine";
import { heartsAiService } from "@/lib/games/hearts/ai/service";
import { createHeartsDefinition } from "@/lib/games/hearts/rules";
import { legalCardsForPlayer } from "@/lib/games/hearts/validators";
import type { HeartsAction, HeartsState } from "@/lib/games/hearts/types";
import {
  DEFAULT_HEARTS_SETTINGS,
  DEFAULT_HEARTS_STATS,
  type HeartsSettings,
  type HeartsStats,
  loadHeartsSettings,
  loadHeartsState,
  loadHeartsStats,
  saveHeartsSettings,
  saveHeartsState,
  saveHeartsStats,
} from "@/lib/games/storage";
import { HeartsHand } from "./components/HeartsHand";
import { HeartsMainMenu } from "./components/HeartsMainMenu";
import { HeartsScoreboard } from "./components/HeartsScoreboard";
import { HeartsTrickView } from "./components/HeartsTrickView";

interface OnlineSession {
  roomCode: string;
  playerId: string;
  joinToken: string;
  hostSecret?: string;
}

const HUMAN_ID = "human-player";

export default function HeartsClient() {
  const [state, setState] = useState<HeartsState | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [selectedPass, setSelectedPass] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [onlineSession, setOnlineSession] = useState<OnlineSession | null>(null);
  const [settings, setSettings] = useState<HeartsSettings>(DEFAULT_HEARTS_SETTINGS);
  const [stats, setStats] = useState<HeartsStats>(DEFAULT_HEARTS_STATS);
  const [turnTimer, setTurnTimer] = useState(30);

  const engineRef = useRef<GameEngine<HeartsState, HeartsAction> | null>(null);
  const definitionRef = useRef<ReturnType<typeof createHeartsDefinition> | null>(null);
  const finishedRoundRef = useRef<string | null>(null);

  const startOfflineGame = useCallback(
    (resumeState?: HeartsState) => {
      const definition = createHeartsDefinition({
        players: [
          { id: HUMAN_ID, name: "Вы", isBot: false, aiLevel: settings.aiLevel },
          { id: "bot-1", name: "Bot 1", isBot: true, aiLevel: "easy" },
          { id: "bot-2", name: "Bot 2", isBot: true, aiLevel: "medium" },
          { id: "bot-3", name: "Bot 3", isBot: true, aiLevel: "hard" },
        ],
        config: { turnTimeSec: 30, passTimeSec: 30 },
      });
      const engine = new GameEngine(definition);
      if (resumeState) {
        engine.replaceState(resumeState);
      }
      definitionRef.current = definition;
      engineRef.current = engine;
      setOnlineSession(null);
      setState(engine.getState());
      setSelectedPass([]);
      setMessage(null);
    },
    [settings.aiLevel],
  );

  useEffect(() => {
    void loadHeartsSettings().then(setSettings).catch(() => {});
    void loadHeartsStats().then(setStats).catch(() => {});
    void loadHeartsState<HeartsState>().then((saved) => {
      if (saved && saved.phase !== "game_end") {
        startOfflineGame(saved);
      } else {
        startOfflineGame();
      }
    });
  }, [startOfflineGame]);

  useEffect(() => {
    void saveHeartsSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (!state || onlineSession) return;
    void saveHeartsState(state);
  }, [state, onlineSession]);

  const localDispatch = useCallback((action: HeartsAction) => {
    if (!engineRef.current) return;
    const result = engineRef.current.dispatch(action, {
      actorId:
        action.type === "play_card"
          ? action.playerId
          : action.type === "select_pass_cards"
            ? action.playerId
            : "system",
      at: Date.now(),
    });
    if (!result.valid) {
      setMessage(result.reason ?? "Недопустимое действие");
      return;
    }
    setState(result.state);
  }, []);

  const remoteDispatch = useCallback(
    async (action: HeartsAction) => {
      if (!onlineSession) return;
      const response = await fetch(
        `/api/games/hearts/rooms/${encodeURIComponent(onlineSession.roomCode)}/actions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            playerId: onlineSession.playerId,
            joinToken: onlineSession.joinToken,
            action,
          }),
        },
      );
      const data = (await response.json()) as { error?: string; state?: HeartsState };
      if (!response.ok) {
        setMessage(data.error ?? "Ошибка отправки действия");
        return;
      }
      setState((data as { state: HeartsState }).state);
    },
    [onlineSession],
  );

  const dispatch = useCallback(
    (action: HeartsAction) => {
      if (onlineSession) {
        void remoteDispatch(action);
        return;
      }
      localDispatch(action);
    },
    [localDispatch, onlineSession, remoteDispatch],
  );

  const legalCardIds = useMemo(() => {
    if (!state) return new Set<string>();
    return new Set(legalCardsForPlayer(state, onlineSession?.playerId ?? HUMAN_ID).map((c) => c.id));
  }, [state, onlineSession?.playerId]);

  useEffect(() => {
    if (!state || onlineSession || state.phase !== "playing") return;
    const seat = state.players.find((player) => player.id === state.currentTurnId);
    if (!seat?.isBot) return;
    const timer = window.setTimeout(() => {
      const definition = definitionRef.current;
      if (!definition) return;
      const legal = definition.getLegalActions(state, seat.id);
      const chosen = heartsAiService.choose(seat.aiLevel, {
        state,
        playerId: seat.id,
        legalActions: legal,
      });
      if (chosen) localDispatch(chosen);
    }, 550);
    return () => window.clearTimeout(timer);
  }, [localDispatch, onlineSession, state]);

  useEffect(() => {
    if (!state || onlineSession || state.phase !== "passing") return;
    const timer = window.setTimeout(() => {
      state.players
        .filter((player) => player.isBot)
        .forEach((bot) => {
          const existing = state.passSelections[bot.id] ?? [];
          if (existing.length === 3 || state.passDirection === "none") return;
          const selected = bot.hand.slice(-3).map((card) => card.id);
          localDispatch({ type: "select_pass_cards", playerId: bot.id, cardIds: selected });
        });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [localDispatch, onlineSession, state]);

  useEffect(() => {
    let prevTurnKey = `${state?.phase ?? "none"}:${state?.currentTurnId ?? "none"}`;
    const id = window.setInterval(() => {
      setTurnTimer((value) => {
        const nextTurnKey = `${state?.phase ?? "none"}:${state?.currentTurnId ?? "none"}`;
        if (nextTurnKey !== prevTurnKey) {
          prevTurnKey = nextTurnKey;
          return 30;
        }
        if (!state || state.phase !== "playing") return 30;
        return Math.max(0, value - 1);
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [state]);

  useEffect(() => {
    if (!state || turnTimer > 0 || state.phase !== "playing") return;
    const humanId = onlineSession?.playerId ?? HUMAN_ID;
    if (state.currentTurnId !== humanId) return;
    const legal = legalCardsForPlayer(state, humanId).map((card) => ({
      type: "play_card" as const,
      playerId: humanId,
      cardId: card.id,
    }));
    const fallback = heartsAiService.choose(settings.aiLevel, {
      state,
      playerId: humanId,
      legalActions: legal,
    });
    if (fallback) {
      window.setTimeout(() => dispatch(fallback), 0);
    }
  }, [dispatch, onlineSession?.playerId, settings.aiLevel, state, turnTimer]);

  useEffect(() => {
    if (!onlineSession) return;
    const id = window.setInterval(() => {
      void fetch(`/api/games/hearts/rooms/${encodeURIComponent(onlineSession.roomCode)}`)
        .then((res) => res.json())
        .then((room: { state: HeartsState; error?: string }) => {
          if (room?.state) setState(room.state);
        })
        .catch(() => {});
    }, 1500);
    return () => window.clearInterval(id);
  }, [onlineSession]);

  useEffect(() => {
    if (!onlineSession) return;
    void fetch(`/api/games/hearts/rooms/${encodeURIComponent(onlineSession.roomCode)}/connection`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playerId: onlineSession.playerId,
        joinToken: onlineSession.joinToken,
        connected: true,
      }),
    });
    return () => {
      void fetch(`/api/games/hearts/rooms/${encodeURIComponent(onlineSession.roomCode)}/connection`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId: onlineSession.playerId,
          joinToken: onlineSession.joinToken,
          connected: false,
        }),
      });
    };
  }, [onlineSession]);

  useEffect(() => {
    if (!state || state.phase !== "game_end" || !state.winnerId) return;
    const marker = `${state.gameId}:${state.roundIndex}:${state.winnerId}`;
    if (finishedRoundRef.current === marker) return;
    finishedRoundRef.current = marker;

    const humanId = onlineSession?.playerId ?? HUMAN_ID;
    const won = state.winnerId === humanId;
    const me = state.players.find((player) => player.id === humanId);
    const penalty = me?.totalPenalty ?? 0;
    const moonCount = state.roundScores.filter((round) => round.shootMoonBy === humanId).length;

    const next: HeartsStats = {
      games: stats.games + 1,
      wins: stats.wins + (won ? 1 : 0),
      losses: stats.losses + (won ? 0 : 1),
      winRate: 0,
      shootTheMoonCount: stats.shootTheMoonCount + moonCount,
      averagePenalty: 0,
      bestPenalty:
        stats.bestPenalty === null ? penalty : Math.min(stats.bestPenalty, penalty),
    };
    next.winRate = next.games > 0 ? Math.round((next.wins / next.games) * 100) : 0;
    next.averagePenalty = Math.round(((stats.averagePenalty * stats.games + penalty) / next.games) * 10) / 10;
    setStats(next);
    void saveHeartsStats(next);
  }, [onlineSession?.playerId, state, stats]);

  const me = state?.players.find((player) => player.id === (onlineSession?.playerId ?? HUMAN_ID));
  const canPlay =
    Boolean(state) &&
    state?.phase === "playing" &&
    state.currentTurnId === (onlineSession?.playerId ?? HUMAN_ID);
  const canSelectPass =
    Boolean(state) &&
    state?.phase === "passing" &&
    state.passDirection !== "none" &&
    (state.passSelections[onlineSession?.playerId ?? HUMAN_ID] ?? []).length < 3;

  const togglePassCard = (cardId: string) => {
    if (!canSelectPass) return;
    setSelectedPass((prev) => {
      if (prev.includes(cardId)) return prev.filter((id) => id !== cardId);
      if (prev.length >= 3) return prev;
      return [...prev, cardId];
    });
  };

  const submitPass = () => {
    const playerId = onlineSession?.playerId ?? HUMAN_ID;
    if (selectedPass.length !== 3) {
      setMessage("Выберите ровно 3 карты для обмена");
      return;
    }
    dispatch({ type: "select_pass_cards", playerId, cardIds: selectedPass });
    setSelectedPass([]);
  };

  const playCard = (cardId: string) => {
    const playerId = onlineSession?.playerId ?? HUMAN_ID;
    dispatch({ type: "play_card", playerId, cardId });
  };

  const doQuickOnline = async () => {
    const response = await fetch("/api/games/hearts/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "quick", playerName: "Игрок" }),
    });
    const data = (await response.json()) as {
      error?: string;
      roomCode: string;
      playerId: string;
      joinToken: string;
      hostSecret?: string;
      room: { state: HeartsState };
    };
    if (!response.ok) {
      setMessage(data.error ?? "Не удалось начать онлайн-игру");
      return;
    }
    setOnlineSession({
      roomCode: data.roomCode,
      playerId: data.playerId,
      joinToken: data.joinToken,
      hostSecret: data.hostSecret,
    });
    setState(data.room.state);
    setMessage(`Подключено к комнате ${data.roomCode}`);
  };

  const doCreateRoom = async () => {
    const response = await fetch("/api/games/hearts/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "create", playerName: "Игрок" }),
    });
    const data = (await response.json()) as { error?: string; roomCode: string };
    if (!response.ok) {
      setMessage(data.error ?? "Не удалось создать комнату");
      return;
    }
    setMessage(`Комната создана: ${data.roomCode}. Отправьте код друзьям.`);
  };

  const doJoinByCode = async () => {
    if (!joinCode.trim()) {
      setMessage("Введите код комнаты");
      return;
    }
    const response = await fetch(`/api/games/hearts/rooms/${encodeURIComponent(joinCode)}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerName: "Игрок" }),
    });
    const data = (await response.json()) as {
      error?: string;
      roomCode: string;
      playerId: string;
      joinToken: string;
      room: { state: HeartsState };
    };
    if (!response.ok) {
      setMessage(data.error ?? "Не удалось войти в комнату");
      return;
    }
    setOnlineSession({
      roomCode: data.roomCode,
      playerId: data.playerId,
      joinToken: data.joinToken,
    });
    setState(data.room.state);
    setMessage(`Вы вошли в комнату ${data.roomCode}`);
  };

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-4">
      <div className="mb-4">
        <Link
          href="/tools/games"
          className="text-xs text-violet-600 dark:text-violet-400 hover:underline"
        >
          ← QHub Games
        </Link>
      </div>
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          <HeartsMainMenu
            onQuickOffline={() => startOfflineGame()}
            onQuickOnline={doQuickOnline}
            onCreateRoom={doCreateRoom}
            onJoinByCode={doJoinByCode}
            joinCode={joinCode}
            setJoinCode={setJoinCode}
          />
          <section className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-2">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Настройки</h3>
            <label className="flex items-center justify-between text-xs">
              <span>Сложность ИИ</span>
              <select
                value={settings.aiLevel}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, aiLevel: e.target.value as HeartsSettings["aiLevel"] }))
                }
                className="rounded border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1"
              >
                <option value="easy">Легкий</option>
                <option value="medium">Средний</option>
                <option value="hard">Сложный</option>
              </select>
            </label>
            <label className="flex items-center justify-between text-xs">
              <span>Автосортировка</span>
              <input
                type="checkbox"
                checked={settings.autoSortCards}
                onChange={(e) => setSettings((prev) => ({ ...prev, autoSortCards: e.target.checked }))}
              />
            </label>
          </section>
          <section className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-1 text-xs">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Статистика</h3>
            <p>Партии: {stats.games}</p>
            <p>Победы: {stats.wins}</p>
            <p>Поражения: {stats.losses}</p>
            <p>Winrate: {stats.winRate}%</p>
            <p>Shoot the Moon: {stats.shootTheMoonCount}</p>
            <p>Средний штраф: {stats.averagePenalty}</p>
            <p>Лучший результат: {stats.bestPenalty ?? "—"}</p>
          </section>
        </div>

        <div className="space-y-4">
          <section className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Червы (Hearts)</h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              {onlineSession
                ? `Онлайн-комната ${onlineSession.roomCode}`
                : "Оффлайн режим против 3 ботов"}
            </p>
            {state && (
              <div className="mt-2 text-xs text-gray-500">
                Раунд #{state.roundIndex + 1} · Фаза: {state.phase} · Ход: {state.currentTurnId} · Таймер:{" "}
                {turnTimer}с
              </div>
            )}
            {message && <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">{message}</p>}
          </section>

          {state ? (
            <>
              <HeartsScoreboard state={state} />
              <HeartsTrickView state={state} />
              <section className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
                <div className="flex flex-wrap gap-2">
                  {state.players
                    .filter((player) => player.id !== (onlineSession?.playerId ?? HUMAN_ID))
                    .map((player) => (
                      <div
                        key={player.id}
                        className="rounded-lg border border-gray-100 dark:border-gray-700 px-2 py-1 text-xs"
                      >
                        {player.name} · карт: {player.hand.length}
                      </div>
                    ))}
                </div>
              </section>
              {me && (
                <HeartsHand
                  cards={me.hand}
                  legalCardIds={legalCardIds}
                  selectedForPass={selectedPass}
                  canPlay={canPlay}
                  onSelectPassCard={togglePassCard}
                  onPlayCard={playCard}
                />
              )}
              {canSelectPass && (
                <button
                  type="button"
                  onClick={submitPass}
                  className="rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm px-4 py-2"
                >
                  Подтвердить обмен (3 карты)
                </button>
              )}
            </>
          ) : null}
        </div>
      </div>
    </main>
  );
}
