"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PickerSection } from "@/app/tools/random-picker/components/PickerButton";
import { GameEngine } from "@/lib/games/core/engine";
import { requestAiMove } from "@/lib/games/chess/ai/client";
import { applyClockTimeout, remainingClockMs } from "@/lib/games/chess/clock";
import { capturedPieces, createChessDefinition, isPromotionMove, legalMovesFrom } from "@/lib/games/chess/rules";
import type {
  ChessAction,
  ChessAiLevel,
  ChessColor,
  ChessColorPref,
  ChessState,
} from "@/lib/games/chess/types";
import {
  DEFAULT_AI_TIME_CONTROL_ID,
  DEFAULT_ONLINE_TIME_CONTROL_ID,
  getTimeControl,
  oppositeColor,
  playerByColor,
  playerById,
} from "@/lib/games/chess/types";
import {
  DEFAULT_CHESS_SETTINGS,
  DEFAULT_CHESS_STATS,
  loadChessSettings,
  loadChessState,
  loadChessStats,
  saveChessSettings,
  saveChessState,
  saveChessStats,
  type ChessSettings,
  type ChessStats,
} from "@/lib/games/storage";
import { ChessBoard } from "./components/ChessBoard";
import { ChessGameOver } from "./components/ChessGameOver";
import { ChessMainMenu } from "./components/ChessMainMenu";
import { ChessPlayerBar } from "./components/ChessPlayerBar";
import { ChessPromotion } from "./components/ChessPromotion";
import { ChessStartBanner } from "./components/ChessStartBanner";

interface OnlineSession {
  roomCode: string;
  playerId: string;
  joinToken: string;
}

interface PersistedChessOnlineSession extends OnlineSession {
  playerName: string;
}

interface OnlineRoomResponse {
  roomCode?: string;
  status?: "open" | "playing" | "finished";
  hostPlayerId?: string | null;
  seats?: Array<{ id: string; name: string; connected: boolean }>;
  state?: ChessState;
  error?: string;
  closed?: boolean;
}

const HUMAN_ID = "human-player";
const AI_ID = "ai-player";
const CHESS_ONLINE_SESSION_KEY = "qhub_chess_online_session";
type ChessPanelTab = "menu" | "rules" | "settings" | "stats";

function resolveColor(pref: ChessColorPref): ChessColor {
  if (pref === "random") return Math.random() < 0.5 ? "w" : "b";
  return pref;
}

export default function ChessClient({
  initialMode = "offline",
}: {
  initialMode?: "offline" | "create-online" | "join-online";
}) {
  const [state, setState] = useState<ChessState | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [playerName, setPlayerName] = useState("Игрок 1");
  const [message, setMessage] = useState<string | null>(null);
  const [onlineSession, setOnlineSession] = useState<OnlineSession | null>(null);
  const [roomHostPlayerId, setRoomHostPlayerId] = useState<string | null>(null);
  const [roomStatus, setRoomStatus] = useState<"open" | "playing" | "finished" | null>(null);
  const [roomSeats, setRoomSeats] = useState<OnlineRoomResponse["seats"] | null>(null);
  const [settings, setSettings] = useState<ChessSettings>(DEFAULT_CHESS_SETTINGS);
  const [stats, setStats] = useState<ChessStats>(DEFAULT_CHESS_STATS);
  const [panelTab, setPanelTab] = useState<ChessPanelTab>("menu");
  const [now, setNow] = useState(0);
  const [showBanner, setShowBanner] = useState(false);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: string; to: string } | null>(null);
  const [aiThinking, setAiThinking] = useState(false);
  const [timeControlId, setTimeControlId] = useState(
    initialMode === "offline" ? DEFAULT_AI_TIME_CONTROL_ID : DEFAULT_ONLINE_TIME_CONTROL_ID,
  );

  const engineRef = useRef<GameEngine<ChessState, ChessAction> | null>(null);
  const finishedRef = useRef<string | null>(null);
  const gameAreaRef = useRef<HTMLDivElement | null>(null);
  const wasGameActiveRef = useRef(false);

  const loadPersistedOnlineSession = useCallback((): PersistedChessOnlineSession | null => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(CHESS_ONLINE_SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<PersistedChessOnlineSession>;
      if (!parsed.roomCode || !parsed.playerId || !parsed.joinToken) return null;
      return {
        roomCode: parsed.roomCode,
        playerId: parsed.playerId,
        joinToken: parsed.joinToken,
        playerName: parsed.playerName?.trim() || "Игрок 1",
      };
    } catch {
      return null;
    }
  }, []);

  const startOfflineGame = useCallback(
    (resumeState?: ChessState) => {
      const humanColor = resumeState
        ? (playerById(resumeState, HUMAN_ID)?.color ?? "w")
        : resolveColor(settings.colorPref);
      const definition = createChessDefinition({
        gameId: resumeState?.gameId,
        timeControl: resumeState?.timeControl ?? getTimeControl(timeControlId),
        now: Date.now(),
        players: [
          { id: HUMAN_ID, name: "Вы", color: humanColor, isBot: false },
          {
            id: AI_ID,
            name: `ИИ · ${settings.aiLevel}`,
            color: oppositeColor(humanColor),
            isBot: true,
          },
        ],
      });
      const engine = new GameEngine(definition);
      if (resumeState) engine.replaceState(resumeState);
      engineRef.current = engine;
      setOnlineSession(null);
      setRoomHostPlayerId(null);
      setRoomStatus(null);
      setRoomSeats(null);
      setPendingPromotion(null);
      setState(engine.getState());
      setShowBanner(true);
      setMessage(null);
    },
    [settings.aiLevel, settings.colorPref, timeControlId],
  );

  useEffect(() => {
    void loadChessSettings().then((loaded) => {
      setSettings(loaded);
      setTimeControlId(loaded.timeControlId || timeControlId);
    }).catch(() => {});
    void loadChessStats().then(setStats).catch(() => {});
    const persistedOnline = loadPersistedOnlineSession();
    if (persistedOnline) {
      setPlayerName(persistedOnline.playerName);
      setOnlineSession({
        roomCode: persistedOnline.roomCode,
        playerId: persistedOnline.playerId,
        joinToken: persistedOnline.joinToken,
      });
      setMessage(`Восстановлено подключение к комнате ${persistedOnline.roomCode}`);
      return;
    }
    void loadChessState().then((saved) => {
      if (saved && saved.phase === "playing") startOfflineGame(saved);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadPersistedOnlineSession]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!onlineSession) {
      window.localStorage.removeItem(CHESS_ONLINE_SESSION_KEY);
      return;
    }
    window.localStorage.setItem(
      CHESS_ONLINE_SESSION_KEY,
      JSON.stringify({ ...onlineSession, playerName: playerName.trim() || "Игрок 1" }),
    );
  }, [onlineSession, playerName]);

  useEffect(() => {
    void saveChessSettings({ ...settings, timeControlId });
  }, [settings, timeControlId]);

  useEffect(() => {
    if (!state || onlineSession) return;
    void saveChessState(state.phase === "playing" ? state : null);
  }, [state, onlineSession]);

  useEffect(() => {
    if (!showBanner) return;
    const id = window.setTimeout(() => setShowBanner(false), 2200);
    return () => window.clearTimeout(id);
  }, [showBanner, state?.gameId]);

  useEffect(() => {
    setNow(Date.now());
  }, []);

  useEffect(() => {
    if (state?.phase !== "playing" || !state.clocksRunning) return;
    const id = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(id);
  }, [state?.phase, state?.clocksRunning, state?.currentTurn]);

  const applyGameState = useCallback((nextState: ChessState) => {
    setState(nextState);
    if (nextState.phase === "playing" && nextState.moves.length === 0) setShowBanner(true);
  }, []);

  const localDispatch = useCallback(
    (action: ChessAction, actorId: string) => {
      if (!engineRef.current) return;
      const result = engineRef.current.dispatch(action, { actorId, at: Date.now() });
      if (!result.valid) {
        setMessage(result.reason ?? "Недопустимое действие");
        return;
      }
      applyGameState(result.state);
      setPendingPromotion(null);
    },
    [applyGameState],
  );

  const remoteDispatch = useCallback(
    async (action: ChessAction) => {
      if (!onlineSession) return;
      const response = await fetch(`/api/games/chess/rooms/${encodeURIComponent(onlineSession.roomCode)}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId: onlineSession.playerId,
          joinToken: onlineSession.joinToken,
          action,
        }),
      });
      const data = (await response.json()) as OnlineRoomResponse;
      if (!response.ok) {
        setMessage(data.error ?? "Ошибка отправки хода");
        return;
      }
      if (data.state) applyGameState(data.state);
      setRoomHostPlayerId(data.hostPlayerId ?? null);
      setRoomStatus(data.status ?? null);
      setRoomSeats(data.seats ?? null);
      setPendingPromotion(null);
    },
    [applyGameState, onlineSession],
  );

  const dispatch = useCallback(
    (action: ChessAction, actorId?: string) => {
      if (onlineSession) {
        void remoteDispatch(action);
        return;
      }
      localDispatch(action, actorId ?? HUMAN_ID);
    },
    [localDispatch, onlineSession, remoteDispatch],
  );

  useEffect(() => {
    if (!state || onlineSession || state.phase !== "playing") return;
    const flagged = applyClockTimeout(state, now);
    if (flagged.phase === "finished") {
      engineRef.current?.replaceState(flagged);
      setState(flagged);
    }
  }, [now, onlineSession, state]);

  useEffect(() => {
    if (!state || onlineSession || state.phase !== "playing") return;
    const seat = playerByColor(state, state.currentTurn);
    if (!seat?.isBot) {
      setAiThinking(false);
      return;
    }
    let cancelled = false;
    setAiThinking(true);
    const timer = window.setTimeout(() => {
      void requestAiMove(state.fen, settings.aiLevel).then((move) => {
        if (cancelled || !move) return;
        localDispatch({ type: "move", ...move }, seat.id);
        setAiThinking(false);
      });
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [localDispatch, onlineSession, settings.aiLevel, state]);

  useEffect(() => {
    if (!onlineSession) return;
    const id = window.setInterval(() => {
      void fetch(`/api/games/chess/rooms/${encodeURIComponent(onlineSession.roomCode)}`)
        .then(async (res) => {
          if (!res.ok) {
            setOnlineSession(null);
            setRoomHostPlayerId(null);
            setRoomStatus(null);
            setRoomSeats(null);
            setState(null);
            setMessage("Комната закрыта.");
            return null;
          }
          return (await res.json()) as OnlineRoomResponse;
        })
        .then((room) => {
          if (!room?.state) return;
          applyGameState(room.state);
          setRoomHostPlayerId(room.hostPlayerId ?? null);
          setRoomStatus(room.status ?? null);
          setRoomSeats(room.seats ?? null);
        })
        .catch(() => {});
    }, 1000);
    return () => window.clearInterval(id);
  }, [applyGameState, onlineSession]);

  useEffect(() => {
    if (!onlineSession) return;
    void fetch(`/api/games/chess/rooms/${encodeURIComponent(onlineSession.roomCode)}/connection`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playerId: onlineSession.playerId,
        joinToken: onlineSession.joinToken,
        connected: true,
      }),
    })
      .then((res) => res.json())
      .then((room: OnlineRoomResponse) => {
        if (room.closed) {
          setOnlineSession(null);
          setState(null);
          setMessage("Комната закрыта.");
          return;
        }
        if (room.state) applyGameState(room.state);
        setRoomHostPlayerId(room.hostPlayerId ?? null);
        setRoomStatus(room.status ?? null);
        setRoomSeats(room.seats ?? null);
      })
      .catch(() => {});
    return () => {
      void fetch(`/api/games/chess/rooms/${encodeURIComponent(onlineSession.roomCode)}/connection`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId: onlineSession.playerId,
          joinToken: onlineSession.joinToken,
          connected: false,
        }),
      });
    };
  }, [applyGameState, onlineSession]);

  useEffect(() => {
    if (!state || state.phase !== "finished") return;
    const marker = `${state.gameId}:${state.endReason}:${state.winnerId ?? "draw"}`;
    if (finishedRef.current === marker) return;
    finishedRef.current = marker;
    const humanId = onlineSession?.playerId ?? HUMAN_ID;
    const won = state.winnerId === humanId;
    const draw = !state.winnerId;
    const next: ChessStats = {
      games: stats.games + 1,
      wins: stats.wins + (won ? 1 : 0),
      losses: stats.losses + (!won && !draw ? 1 : 0),
      draws: stats.draws + (draw ? 1 : 0),
      winRate: 0,
    };
    next.winRate = next.games > 0 ? Math.round((next.wins / next.games) * 100) : 0;
    setStats(next);
    void saveChessStats(next);
  }, [onlineSession?.playerId, state, stats]);

  const leaveOnlineRoom = useCallback(async () => {
    if (!onlineSession) return;
    await fetch(`/api/games/chess/rooms/${encodeURIComponent(onlineSession.roomCode)}/connection`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playerId: onlineSession.playerId,
        joinToken: onlineSession.joinToken,
        connected: false,
      }),
    }).catch(() => {});
    setOnlineSession(null);
    setRoomHostPlayerId(null);
    setRoomStatus(null);
    setRoomSeats(null);
    setState(null);
    engineRef.current = null;
    setMessage("Вы покинули онлайн-комнату.");
  }, [onlineSession]);

  const closeOnlineRoom = useCallback(async () => {
    if (!onlineSession) return false;
    const response = await fetch(`/api/games/chess/rooms/${encodeURIComponent(onlineSession.roomCode)}`, {
      method: "DELETE",
      headers: {
        "x-player-id": onlineSession.playerId,
        "x-join-token": onlineSession.joinToken,
      },
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => ({ error: "" }))) as { error?: string };
      setMessage(data.error ?? "Закрыть комнату может только владелец");
      return false;
    }
    setOnlineSession(null);
    setRoomHostPlayerId(null);
    setRoomStatus(null);
    setRoomSeats(null);
    setState(null);
    engineRef.current = null;
    setMessage("Комната закрыта.");
    return true;
  }, [onlineSession]);

  const humanId = onlineSession?.playerId ?? HUMAN_ID;
  const me = state ? playerById(state, humanId) : undefined;
  const opponent = state?.players.find((player) => player.id !== humanId);
  const orientation: ChessColor = me?.color ?? "w";
  const isRoomOwner = Boolean(onlineSession && roomHostPlayerId && onlineSession.playerId === roomHostPlayerId);
  const onlinePlayersCount = roomSeats?.filter((seat) => seat.connected).length ?? 0;
  const isOnlineWaiting = Boolean(onlineSession && roomStatus === "open");
  const isGameActive = Boolean(state && state.phase !== "waiting" && !isOnlineWaiting);
  const myTurn = Boolean(state && state.phase === "playing" && me && state.currentTurn === me.color && !aiThinking);

  const captured = state ? capturedPieces(state.fen) : { w: [], b: [] };

  const legalTargets = useCallback(
    (from: string) => {
      if (!state || !myTurn) return [];
      return [...new Set(legalMovesFrom(state.fen, from).map((move) => move.to))];
    },
    [myTurn, state],
  );

  const onBoardMove = (from: string, to: string) => {
    if (!state || !myTurn) return;
    if (isPromotionMove(from, to, state.fen)) {
      setPendingPromotion({ from, to });
      return;
    }
    dispatch({ type: "move", from, to }, humanId);
  };

  const copyRoomCode = () => {
    if (!onlineSession?.roomCode) return;
    void navigator.clipboard
      .writeText(onlineSession.roomCode)
      .then(() => setMessage(`Код комнаты ${onlineSession.roomCode} скопирован`))
      .catch(() => setMessage("Не удалось скопировать код"));
  };

  const shareRoomCode = useCallback(() => {
    if (!onlineSession?.roomCode) return;
    const text = `Код комнаты в Шахматы: ${onlineSession.roomCode}`;
    if (typeof navigator.share === "function") {
      void navigator.share({ title: "Шахматы — код комнаты", text }).catch(() => {});
      return;
    }
    copyRoomCode();
  }, [onlineSession?.roomCode]);

  const doCreateRoom = useCallback(async () => {
    const response = await fetch("/api/games/chess/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playerName: playerName.trim() || "Игрок 1",
        colorPref: settings.colorPref,
        timeControlId,
      }),
    });
    const data = (await response.json()) as OnlineRoomResponse & {
      playerId: string;
      joinToken: string;
      room: OnlineRoomResponse;
    };
    if (!response.ok) {
      setMessage(data.error ?? "Не удалось создать комнату");
      return;
    }
    setOnlineSession({ roomCode: data.roomCode!, playerId: data.playerId, joinToken: data.joinToken });
    applyGameState(data.room.state!);
    setRoomHostPlayerId(data.room.hostPlayerId ?? null);
    setRoomStatus(data.room.status ?? null);
    setRoomSeats(data.room.seats ?? null);
    setMessage(`Комната создана: ${data.roomCode}. Поделитесь кодом с соперником.`);
  }, [applyGameState, playerName, settings.colorPref, timeControlId]);

  const doJoinByCode = async () => {
    if (!joinCode.trim()) {
      setMessage("Введите код комнаты");
      return;
    }
    const response = await fetch(`/api/games/chess/rooms/${encodeURIComponent(joinCode)}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerName: playerName.trim() || "Игрок 1" }),
    });
    const data = (await response.json()) as OnlineRoomResponse & {
      playerId: string;
      joinToken: string;
      room: OnlineRoomResponse;
    };
    if (!response.ok) {
      setMessage(data.error ?? "Не удалось войти в комнату");
      return;
    }
    setOnlineSession({ roomCode: data.roomCode!, playerId: data.playerId, joinToken: data.joinToken });
    applyGameState(data.room.state!);
    setRoomHostPlayerId(data.room.hostPlayerId ?? null);
    setRoomStatus(data.room.status ?? null);
    setRoomSeats(data.room.seats ?? null);
    setMessage(`Вы вошли в комнату ${data.roomCode}`);
  };

  useEffect(() => {
    if (isGameActive && !wasGameActiveRef.current) {
      gameAreaRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    }
    wasGameActiveRef.current = isGameActive;
  }, [isGameActive]);

  const whiteName = playerByColor(state ?? ({ players: [] } as unknown as ChessState), "w")?.name ?? "Белые";
  const blackName = playerByColor(state ?? ({ players: [] } as unknown as ChessState), "b")?.name ?? "Чёрные";

  return (
    <main className="flex min-h-0 flex-1 flex-col bg-gray-50 dark:bg-gray-950">
      <div className="flex-1 overflow-y-auto" data-chess-scroll="true">
        <div className="mx-auto w-full max-w-xl space-y-4 px-4 py-5">
          <Link href="/tools/games" className="inline-flex text-xs text-slate-700 hover:underline dark:text-slate-300">
            ← QHub Games
          </Link>
          <section className="rounded-2xl border border-slate-200 bg-gradient-to-br from-amber-50 via-white to-stone-50 p-4 dark:border-slate-800 dark:from-stone-900 dark:via-slate-900 dark:to-slate-950">
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Шахматы</h1>
            <p className="mt-1 text-xs text-gray-500">Классические шахматы: ИИ, онлайн-комната и часы.</p>
          </section>

          <PickerSection
            tabs={[
              { id: "menu", label: "Режимы", shortLabel: "Меню" },
              { id: "rules", label: "Правила игры", shortLabel: "Правила" },
              { id: "settings", label: "Настройки", shortLabel: "Настр." },
              { id: "stats", label: "Статистика", shortLabel: "Стат." },
            ]}
            activeTab={panelTab}
            onTabChange={(id) => setPanelTab(id as ChessPanelTab)}
          >
            {panelTab === "menu" ? (
              <ChessMainMenu
                onStartOffline={() => startOfflineGame()}
                onCreateRoom={() => void doCreateRoom()}
                onJoinByCode={() => void doJoinByCode()}
                onCopyRoomCode={copyRoomCode}
                onShareRoomCode={shareRoomCode}
                onLeaveRoom={() => void leaveOnlineRoom()}
                onCloseRoom={() => void closeOnlineRoom()}
                playerName={playerName}
                setPlayerName={setPlayerName}
                joinCode={joinCode}
                setJoinCode={setJoinCode}
                onlineRoomCode={onlineSession?.roomCode ?? null}
                isRoomOwner={isRoomOwner}
                onlineStatus={roomStatus}
                onlinePlayersCount={onlinePlayersCount}
                initialTab={initialMode === "create-online" || initialMode === "join-online" ? initialMode : "offline"}
                aiLevel={settings.aiLevel}
                setAiLevel={(aiLevel) => setSettings((prev) => ({ ...prev, aiLevel }))}
                colorPref={settings.colorPref}
                setColorPref={(colorPref) => setSettings((prev) => ({ ...prev, colorPref }))}
                timeControlId={timeControlId}
                setTimeControlId={setTimeControlId}
              />
            ) : panelTab === "settings" ? (
              <div className="space-y-2 text-xs text-gray-600 dark:text-gray-300">
                <p>Цвет, контроль времени и уровень ИИ задаются во вкладке «Режимы» перед стартом партии.</p>
                <p>Текущий уровень ИИ: {settings.aiLevel}/10. Контроль: {getTimeControl(timeControlId).label}.</p>
              </div>
            ) : panelTab === "stats" ? (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-gray-50 px-2.5 py-2 dark:bg-gray-800">Партии: {stats.games}</div>
                <div className="rounded-lg bg-gray-50 px-2.5 py-2 dark:bg-gray-800">Победы: {stats.wins}</div>
                <div className="rounded-lg bg-gray-50 px-2.5 py-2 dark:bg-gray-800">Поражения: {stats.losses}</div>
                <div className="rounded-lg bg-gray-50 px-2.5 py-2 dark:bg-gray-800">Ничьи: {stats.draws}</div>
              </div>
            ) : (
              <div className="space-y-2 text-xs leading-relaxed text-gray-600 dark:text-gray-400">
                <p>• Ходите фигурами по очереди. Свои всегда внизу доски.</p>
                <p>• Рокировка: король на две клетки в сторону ладьи. Ладья переставляется сама.</p>
                <p>• Часы Фишера: время идёт на вашем ходу, после хода добавляется инкремент.</p>
                <p>• Проигрыш — мат, истечение времени, сдача или отключение в онлайне.</p>
              </div>
            )}
          </PickerSection>

          {message ? <p className="text-xs text-gray-600 dark:text-gray-300">{message}</p> : null}

          {isOnlineWaiting ? (
            <section className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900/60 dark:bg-amber-950/20">
              <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300">Ожидание соперника</h3>
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                Игроков в комнате: {onlinePlayersCount}/2. Партия начнётся, как только присоединится второй игрок.
              </p>
            </section>
          ) : null}

          {isGameActive && state ? (
            <div ref={gameAreaRef} className="space-y-2">
              {opponent ? (
                <ChessPlayerBar
                  name={opponent.name}
                  color={opponent.color}
                  captured={opponent.color === "w" ? captured.b : captured.w}
                  remainingMs={remainingClockMs(state, opponent.color, now)}
                  active={state.phase === "playing" && state.currentTurn === opponent.color}
                />
              ) : null}

              <div className="relative">
                <ChessBoard
                  fen={state.fen}
                  orientation={orientation}
                  lastMove={state.lastMove}
                  inCheck={state.inCheck}
                  currentTurn={state.currentTurn}
                  interactable={myTurn && state.phase === "playing"}
                  legalTargets={legalTargets}
                  onMove={onBoardMove}
                />
                {showBanner && state.phase === "playing" && state.moves.length === 0 ? (
                  <ChessStartBanner
                    whiteName={whiteName}
                    blackName={blackName}
                    subtitle={state.timeControl.label}
                  />
                ) : null}
                {pendingPromotion && me ? (
                  <ChessPromotion
                    color={me.color}
                    onChoose={(promotion) =>
                      dispatch({ type: "move", from: pendingPromotion.from, to: pendingPromotion.to, promotion }, humanId)
                    }
                    onCancel={() => setPendingPromotion(null)}
                  />
                ) : null}
                {state.phase === "finished" && state.endReason ? (
                  <ChessGameOver
                    reason={state.endReason}
                    winnerName={state.winnerId ? playerById(state, state.winnerId)?.name ?? "Победитель" : null}
                    onRematch={onlineSession ? undefined : () => startOfflineGame()}
                    onMenu={() => {
                      setState(null);
                      engineRef.current = null;
                      void saveChessState(null);
                    }}
                  />
                ) : null}
              </div>

              {me ? (
                <ChessPlayerBar
                  name={me.name}
                  color={me.color}
                  captured={me.color === "w" ? captured.b : captured.w}
                  remainingMs={remainingClockMs(state, me.color, now)}
                  active={state.phase === "playing" && state.currentTurn === me.color}
                />
              ) : null}

              {aiThinking ? <p className="text-center text-xs text-emerald-700 dark:text-emerald-400">ИИ думает…</p> : null}

              {state.drawOfferedBy && state.drawOfferedBy !== humanId ? (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => dispatch({ type: "accept_draw" }, humanId)}
                    className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white"
                  >
                    Принять ничью
                  </button>
                  <button
                    type="button"
                    onClick={() => dispatch({ type: "decline_draw" }, humanId)}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700"
                  >
                    Отклонить
                  </button>
                </div>
              ) : null}

              {state.phase === "playing" ? (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm("Предложить ничью?")) dispatch({ type: "offer_draw" }, humanId);
                    }}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700"
                  >
                    Ничья
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm("Сдаться?")) dispatch({ type: "resign" }, humanId);
                    }}
                    className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:text-red-300"
                  >
                    Сдаться
                  </button>
                </div>
              ) : null}

              {state.moves.length > 0 ? (
                <section className="rounded-xl border border-gray-200 bg-white p-2.5 dark:border-gray-800 dark:bg-gray-900">
                  <p className="text-[11px] uppercase tracking-wide text-gray-500">Ходы</p>
                  <p className="mt-1 font-mono text-xs leading-relaxed text-gray-700 dark:text-gray-200">
                    {state.moves.map((move, index) => (index % 2 === 0 ? `${Math.floor(index / 2) + 1}. ${move.san}` : move.san)).join(" ")}
                  </p>
                </section>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
