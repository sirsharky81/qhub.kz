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
import { PrivacyBanner } from "@/app/tools/file-converter/components/PrivacyBanner";
import { PickerSection } from "@/app/tools/random-picker/components/PickerButton";

interface OnlineSession {
  roomCode: string;
  playerId: string;
  joinToken: string;
  hostSecret?: string;
}

interface RoomInactivity {
  enabled: boolean;
  activePlayerId: string | null;
  deadlineAt: number | null;
  excludedPlayerIds: string[];
}

interface OnlineRoomResponse {
  state: HeartsState;
  inactivity: RoomInactivity;
  error?: string;
}

const HUMAN_ID = "human-player";
type HeartsPanelTab = "menu" | "rules" | "settings" | "stats";

function normalizeHeartsMessage(input: string): string {
  if (input === "Card is not legal in current trick") return "Этой картой сейчас ходить нельзя";
  if (input === "Not this player's turn") return "Сейчас ход другого игрока";
  if (input === "Round is not in playing phase") return "Сейчас не фаза хода";
  return input;
}

export default function HeartsClient() {
  const [state, setState] = useState<HeartsState | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [selectedPass, setSelectedPass] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [onlineSession, setOnlineSession] = useState<OnlineSession | null>(null);
  const [settings, setSettings] = useState<HeartsSettings>(DEFAULT_HEARTS_SETTINGS);
  const [stats, setStats] = useState<HeartsStats>(DEFAULT_HEARTS_STATS);
  const [inactivity, setInactivity] = useState<RoomInactivity | null>(null);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [panelTab, setPanelTab] = useState<HeartsPanelTab>("menu");

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
      setInactivity(null);
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
      setMessage(normalizeHeartsMessage(result.reason ?? "Недопустимое действие"));
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
      const data = (await response.json()) as OnlineRoomResponse;
      if (!response.ok) {
        setMessage(normalizeHeartsMessage(data.error ?? "Ошибка отправки действия"));
        return;
      }
      setState(data.state);
      setInactivity(data.inactivity ?? null);
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

  const endAndRestartGame = useCallback(() => {
    if (!window.confirm("Завершить текущую партию и начать новую?")) return;

    if (onlineSession?.hostSecret) {
      void fetch(`/api/games/hearts/rooms/${encodeURIComponent(onlineSession.roomCode)}`, {
        method: "DELETE",
        headers: { "x-host-secret": onlineSession.hostSecret },
      }).catch(() => {});
    }
    setOnlineSession(null);
    setInactivity(null);
    startOfflineGame();
    setMessage("Партия завершена досрочно. Запущена новая игра.");
  }, [onlineSession, startOfflineGame]);

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
    const id = window.setInterval(() => setNowTs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!onlineSession) return;
    const id = window.setInterval(() => {
      void fetch(`/api/games/hearts/rooms/${encodeURIComponent(onlineSession.roomCode)}`)
        .then((res) => res.json())
        .then((room: OnlineRoomResponse) => {
          if (room?.state) {
            setState(room.state);
            setInactivity(room.inactivity ?? null);
          }
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
  const onlineCountdownSec = useMemo(() => {
    if (!inactivity?.enabled || !inactivity.deadlineAt) return null;
    return Math.max(0, Math.ceil((inactivity.deadlineAt - nowTs) / 1000));
  }, [inactivity, nowTs]);
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
      room: OnlineRoomResponse;
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
    setInactivity(data.room.inactivity ?? null);
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
      room: OnlineRoomResponse;
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
    setInactivity(data.room.inactivity ?? null);
    setMessage(`Вы вошли в комнату ${data.roomCode}`);
  };

  return (
    <main className="flex flex-col flex-1 min-h-0 bg-gray-50 dark:bg-gray-950">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl px-4 py-5 space-y-4">
          <Link href="/tools/games" className="inline-flex text-xs text-violet-600 dark:text-violet-400 hover:underline">
            ← QHub Games
          </Link>

          <section className="rounded-2xl border border-violet-200/70 dark:border-violet-900/70 bg-gradient-to-br from-violet-500/10 via-fuchsia-500/10 to-indigo-500/10 p-4">
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Червы (Hearts)</h1>
            <p className="mt-1 text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
              {onlineSession ? `Онлайн-комната ${onlineSession.roomCode}` : "Оффлайн партия против 3 ботов"}
            </p>
            <div className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
              {state
                ? `Раунд #${state.roundIndex + 1} · Фаза: ${state.phase} · Ход: ${state.currentTurnId}`
                : "Инициализация партии..."}
              {onlineSession && inactivity?.enabled && onlineCountdownSec !== null
                ? ` · Неактивность: ${onlineCountdownSec}с`
                : ""}
            </div>
            <div className="mt-2">
              <PrivacyBanner compact />
            </div>
            {onlineSession && inactivity?.enabled && inactivity.excludedPlayerIds.length > 0 && (
              <p className="mt-2 text-xs text-red-600 dark:text-red-400">
                Игроки без хода более 3 минут переведены под управление бота.
              </p>
            )}
            {message && <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">{message}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={endAndRestartGame}
                className="rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 hover:bg-white/70 dark:hover:bg-gray-800"
              >
                Завершить и начать заново
              </button>
              <button
                type="button"
                onClick={() => startOfflineGame()}
                className="rounded-lg bg-violet-600 hover:bg-violet-500 text-white px-3 py-1.5 text-xs font-medium"
              >
                Новая оффлайн партия
              </button>
            </div>
          </section>

          <PickerSection
            tabs={[
              { id: "menu", label: "Режимы", shortLabel: "Меню" },
              { id: "rules", label: "Правила игры", shortLabel: "Правила" },
              { id: "settings", label: "Настройки", shortLabel: "Настр." },
              { id: "stats", label: "Статистика", shortLabel: "Стат." },
            ]}
            activeTab={panelTab}
            onTabChange={(id) => setPanelTab(id as HeartsPanelTab)}
          >
            {panelTab === "menu" ? (
              <HeartsMainMenu
                onQuickOffline={() => startOfflineGame()}
                onQuickOnline={doQuickOnline}
                onCreateRoom={doCreateRoom}
                onJoinByCode={doJoinByCode}
                joinCode={joinCode}
                setJoinCode={setJoinCode}
              />
            ) : panelTab === "settings" ? (
              <div className="space-y-3">
                <label className="flex items-center justify-between text-xs">
                  <span>Сложность ИИ</span>
                  <select
                    value={settings.aiLevel}
                    onChange={(e) =>
                      setSettings((prev) => ({ ...prev, aiLevel: e.target.value as HeartsSettings["aiLevel"] }))
                    }
                    className="rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-2 py-1"
                  >
                    <option value="easy">Легкий</option>
                    <option value="medium">Средний</option>
                    <option value="hard">Сложный</option>
                  </select>
                </label>
                <label className="flex items-center justify-between text-xs">
                  <span>Автосортировка карт</span>
                  <input
                    type="checkbox"
                    checked={settings.autoSortCards}
                    onChange={(e) => setSettings((prev) => ({ ...prev, autoSortCards: e.target.checked }))}
                  />
                </label>
              </div>
            ) : panelTab === "stats" ? (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-gray-50 dark:bg-gray-800 px-2.5 py-2">Партии: {stats.games}</div>
                <div className="rounded-lg bg-gray-50 dark:bg-gray-800 px-2.5 py-2">Победы: {stats.wins}</div>
                <div className="rounded-lg bg-gray-50 dark:bg-gray-800 px-2.5 py-2">Поражения: {stats.losses}</div>
                <div className="rounded-lg bg-gray-50 dark:bg-gray-800 px-2.5 py-2">Winrate: {stats.winRate}%</div>
                <div className="rounded-lg bg-gray-50 dark:bg-gray-800 px-2.5 py-2">
                  Shoot the Moon: {stats.shootTheMoonCount}
                </div>
                <div className="rounded-lg bg-gray-50 dark:bg-gray-800 px-2.5 py-2">
                  Средний штраф: {stats.averagePenalty}
                </div>
              </div>
            ) : (
              <div className="space-y-2 text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                <p>• Игрок с 2♣ начинает первую взятку.</p>
                <p>• Обязательно ходить в масть, если карта есть.</p>
                <p>• До открытия нельзя начинать ход с ♥ (кроме случая когда на руках только штрафные карты).</p>
                <p>• Каждая ♥ = 1 штрафное очко, Q♠ = 13.</p>
                <p>• При сборе всех 26 очков — Shoot the Moon.</p>
              </div>
            )}
          </PickerSection>

          {state ? (
            <div className="space-y-4">
              <HeartsScoreboard state={state} />
              <HeartsTrickView state={state} />
              <section className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
                <h3 className="text-xs uppercase tracking-wide text-gray-500 mb-2">Оппоненты</h3>
                <div className="flex flex-wrap gap-2">
                  {state.players
                    .filter((player) => player.id !== (onlineSession?.playerId ?? HUMAN_ID))
                    .map((player) => (
                      <div
                        key={player.id}
                        className="rounded-lg border border-gray-100 dark:border-gray-700 px-2 py-1 text-xs bg-gray-50 dark:bg-gray-800"
                      >
                        {player.name} · {player.hand.length} карт
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
                  className="w-full rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm px-4 py-2"
                >
                  Подтвердить обмен (3 карты)
                </button>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
