"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PdfToolLayout } from "@/app/tools/_pdf-shared/PdfToolLayout";
import { GameEngine } from "@/lib/games/core/engine";
import { findSpiderHint, type SpiderHint } from "@/lib/games/spider/hint";
import { createSpiderDefinition } from "@/lib/games/spider/rules";
import { findRunsCompletedByAction } from "@/lib/games/spider/simulate";
import type { SpiderAction, SpiderState, SpiderSuitMode } from "@/lib/games/spider/types";
import type { CardSuit } from "@/lib/games/cards/types";
import {
  clearSpiderState,
  DEFAULT_SPIDER_STATS,
  loadSpiderState,
  loadSpiderStats,
  saveSpiderState,
  saveSpiderStats,
  type SpiderStats,
} from "@/lib/games/storage";
import { SPIDER_FELT, SPIDER_FELT_BORDER, SPIDER_UNDO_LIMIT } from "./constants";
import { SpiderMainMenu } from "./components/SpiderMainMenu";
import { SpiderRulesDialog } from "./components/SpiderRulesDialog";
import { SpiderAnimationLayer, type SpiderFlyItem } from "./components/SpiderAnimationLayer";
import {
  buildDealFlyItems,
  buildFoundationFlyItems,
  buildMoveFlyItems,
} from "./components/spider-animations";
import { SpiderFoundation } from "./components/SpiderFoundation";
import { SpiderStock } from "./components/SpiderStock";
import { SpiderTopBar } from "./components/SpiderTopBar";
import { SpiderStuckBanner, SpiderVictoryScreen } from "./components/SpiderVictoryScreen";
import {
  computeLegalTargets,
  SpiderTableau,
  type SpiderSelection,
} from "./components/SpiderTableau";

const ACTOR_ID = "player";

function formatElapsed(startedAt: number): string {
  const sec = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const mm = Math.floor(sec / 60);
  const ss = sec % 60;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

function cloneState(state: SpiderState): SpiderState {
  return structuredClone(state);
}

export default function SpiderClient() {
  const [state, setState] = useState<SpiderState | null>(null);
  const [stats, setStats] = useState<SpiderStats>(DEFAULT_SPIDER_STATS);
  const [selection, setSelection] = useState<SpiderSelection | null>(null);
  const [hint, setHint] = useState<SpiderHint | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState("0:00");
  const [showMenu, setShowMenu] = useState(false);
  const [completedSuits, setCompletedSuits] = useState<CardSuit[]>([]);
  const [pulseFoundationIndex, setPulseFoundationIndex] = useState<number | null>(null);
  const [flyItems, setFlyItems] = useState<SpiderFlyItem[]>([]);
  const [dealing, setDealing] = useState(false);
  const [historyCount, setHistoryCount] = useState(0);
  const [showRules, setShowRules] = useState(false);

  const engineRef = useRef<GameEngine<SpiderState, SpiderAction> | null>(null);
  const historyRef = useRef<SpiderState[]>([]);
  const finishedGameRef = useRef<string | null>(null);
  const hintTimerRef = useRef<number | null>(null);

  const startGame = useCallback((suitMode: SpiderSuitMode, resumeState?: SpiderState) => {
    const definition = createSpiderDefinition({ suitMode });
    const engine = new GameEngine(definition);
    if (resumeState) {
      engine.replaceState(resumeState);
    }
    engineRef.current = engine;
    historyRef.current = [];
    setHistoryCount(0);
    setState(engine.getState());
    setSelection(null);
    setHint(null);
    setMessage(null);
    setShowMenu(false);
    setCompletedSuits([]);
    setPulseFoundationIndex(null);
    setFlyItems([]);
    setDealing(false);
    finishedGameRef.current = null;
  }, []);

  useEffect(() => {
    void loadSpiderStats().then(setStats).catch(() => {});
    void loadSpiderState<SpiderState>().then((saved) => {
      if (saved && saved.phase === "playing") {
        startGame(saved.suitMode, saved);
      }
    });
  }, [startGame]);

  useEffect(() => {
    if (!state || state.phase !== "playing") return;
    setElapsed(formatElapsed(state.startedAt));
    const timer = window.setInterval(() => setElapsed(formatElapsed(state.startedAt)), 1000);
    return () => window.clearInterval(timer);
  }, [state]);

  useEffect(() => {
    if (!state || state.phase !== "playing") return;
    void saveSpiderState(state);
  }, [state]);

  useEffect(() => {
    if (!state) return;
    if (state.phase !== "won" && state.phase !== "stuck") return;
    if (finishedGameRef.current === state.gameId) return;
    finishedGameRef.current = state.gameId;

    const elapsedSec = Math.max(1, Math.floor((Date.now() - state.startedAt) / 1000));
    setStats((prev) => {
      const next: SpiderStats = {
        games: prev.games + 1,
        wins: prev.wins + (state.phase === "won" ? 1 : 0),
        bestMoves:
          state.phase === "won"
            ? prev.bestMoves === null
              ? state.moves
              : Math.min(prev.bestMoves, state.moves)
            : prev.bestMoves,
        bestTimeSec:
          state.phase === "won"
            ? prev.bestTimeSec === null
              ? elapsedSec
              : Math.min(prev.bestTimeSec, elapsedSec)
            : prev.bestTimeSec,
      };
      void saveSpiderStats(next);
      return next;
    });
    void clearSpiderState();
  }, [state]);

  const clearHint = useCallback(() => {
    if (hintTimerRef.current) window.clearTimeout(hintTimerRef.current);
    setHint(null);
  }, []);

  const runAnimations = useCallback((items: SpiderFlyItem[]) => {
    if (items.length === 0) return;
    setFlyItems(items);
  }, []);

  const applyAction = useCallback(
    (action: SpiderAction, options?: { recordHistory?: boolean }) => {
      if (!engineRef.current || !state) return false;
      if (state.phase !== "playing") return false;

      const recordHistory =
        options?.recordHistory !== false &&
        (action.type === "move_stack" || action.type === "deal_stock");

      if (recordHistory) {
        historyRef.current = [...historyRef.current.slice(-SPIDER_UNDO_LIMIT), cloneState(state)];
        setHistoryCount(historyRef.current.length);
      }

      const prevRuns = state.completedRuns;
      let animations: SpiderFlyItem[] = [];

      if (action.type === "move_stack") {
        animations = buildMoveFlyItems(state, action);
      } else if (action.type === "deal_stock") {
        setDealing(true);
        animations = buildDealFlyItems(state);
        window.setTimeout(() => setDealing(false), 500);
      }

      const result = engineRef.current.dispatch(action, { actorId: ACTOR_ID, at: Date.now() });
      if (!result.valid) {
        if (recordHistory) {
          historyRef.current.pop();
          setHistoryCount(historyRef.current.length);
        }
        setMessage(result.reason ?? "Недопустимый ход");
        setDealing(false);
        return false;
      }

      const runsAdded = result.state.completedRuns - prevRuns;
      if (runsAdded > 0) {
        const newSuits = findRunsCompletedByAction(state, action).map((run) => run.suit);
        animations = [
          ...animations,
          ...buildFoundationFlyItems(state, action, completedSuits, runsAdded),
        ];
        setCompletedSuits((prev) => [...prev, ...newSuits.slice(0, runsAdded)]);
        setPulseFoundationIndex(result.state.completedRuns - 1);
        window.setTimeout(() => setPulseFoundationIndex(null), 600);
      }

      runAnimations(animations);
      setState(result.state);
      setSelection(null);
      clearHint();
      setMessage(null);
      return true;
    },
    [clearHint, completedSuits, runAnimations, state],
  );

  const undo = useCallback(() => {
    if (!engineRef.current || historyRef.current.length === 0 || !state || state.phase !== "playing") {
      setMessage("Нечего отменять");
      return;
    }
    const prev = historyRef.current.pop()!;
    setHistoryCount(historyRef.current.length);
    engineRef.current.replaceState(prev);
    setState(prev);
    setSelection(null);
    clearHint();
    setMessage(null);
    setCompletedSuits((suits) => suits.slice(0, prev.completedRuns));
  }, [clearHint, state]);

  const showHintAction = useCallback(() => {
    if (!state || state.phase !== "playing") return;
    const nextHint = findSpiderHint(state);
    if (!nextHint) {
      setMessage("Нет доступных ходов");
      return;
    }
    setHint(nextHint);
    if (nextHint.type === "move_stack") {
      setSelection({ fromColumn: nextHint.fromColumn, fromIndex: nextHint.fromIndex });
    }
    if (hintTimerRef.current) window.clearTimeout(hintTimerRef.current);
    hintTimerRef.current = window.setTimeout(() => {
      setHint(null);
      setSelection(null);
    }, 4000);
  }, [state]);

  const legalTargets = useMemo(
    () => (state ? computeLegalTargets(state, selection) : new Set<number>()),
    [state, selection],
  );

  const openGameMenu = useCallback(() => {
    setShowMenu(true);
    clearHint();
    setSelection(null);
  }, [clearHint]);

  const resumeGame = useCallback(() => {
    setShowMenu(false);
    setMessage(null);
  }, []);
  const handleNewGame = useCallback(
    (suitMode: SpiderSuitMode) => {
      if (state?.phase === "playing") {
        if (!window.confirm("Начать новую игру? Текущий прогресс будет потерян.")) return;
      }
      startGame(suitMode);
    },
    [startGame, state?.phase],
  );

  const restartGame = useCallback(() => {
    if (!state) return;
    if (!window.confirm("Начать заново с той же сложностью?")) return;
    startGame(state.suitMode);
  }, [startGame, state]);

  const finishGame = useCallback(() => {
    if (!window.confirm("Завершить текущую игру?")) return;
    engineRef.current = null;
    historyRef.current = [];
    setHistoryCount(0);
    finishedGameRef.current = state?.gameId ?? "finished";
    setState(null);
    setSelection(null);
    clearHint();
    setMessage("Игра завершена. Выберите режим для новой партии.");
    setShowMenu(true);
    void clearSpiderState();
  }, [clearHint, state?.gameId]);

  const handleMoveToColumn = useCallback(
    (toColumn: number) => {
      if (!selection) return;
      applyAction({
        type: "move_stack",
        fromColumn: selection.fromColumn,
        fromIndex: selection.fromIndex,
        toColumn,
      });
    },
    [applyAction, selection],
  );

  const handleDeal = useCallback(() => {
    applyAction({ type: "deal_stock" });
  }, [applyAction]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        undo();
        return;
      }
      if (event.key.toLowerCase() === "h") {
        event.preventDefault();
        showHintAction();
        return;
      }
      if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        if (state?.phase === "playing") restartGame();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [restartGame, showHintAction, state?.phase, undo]);

  const canUndo = historyCount > 0 && state?.phase === "playing";
  const showVictory = state?.phase === "won";
  const showGameBoard = state && !showMenu;

  return (
    <PdfToolLayout
      title="Пасьянс «Паук»"
      iconSrc="/tools/games/icon-192.png"
      shellClassName="min-h-[100dvh] flex flex-col bg-gray-50 dark:bg-gray-950 max-sm:landscape:min-h-0 max-sm:landscape:h-[100dvh] max-sm:landscape:overflow-hidden [&>header]:max-sm:landscape:h-10 [&>header>div]:max-sm:landscape:h-10 [&>header>div]:max-sm:landscape:px-2"
      badge={false}
    >
      <SpiderAnimationLayer items={flyItems} />

      {showRules && <SpiderRulesDialog onClose={() => setShowRules(false)} />}

      {showVictory && state && (
        <SpiderVictoryScreen
          elapsed={elapsed}
          moves={state.moves}
          suitMode={state.suitMode}
          onPlayAgain={() => startGame(state.suitMode)}
          onChangeDifficulty={() => {
            openGameMenu();
          }}
        />
      )}

      <main className="flex-1 overflow-y-auto max-sm:landscape:overflow-hidden max-sm:landscape:flex max-sm:landscape:flex-col max-sm:landscape:min-h-0">
        <div className="mx-auto w-full max-w-[1400px] px-2 sm:px-4 py-3 space-y-3 max-sm:landscape:flex-1 max-sm:landscape:flex max-sm:landscape:flex-col max-sm:landscape:min-h-0 max-sm:landscape:py-1 max-sm:landscape:px-1.5 max-sm:landscape:space-y-1">
          {showGameBoard && state && (
            <div className="max-sm:landscape:flex max-sm:landscape:flex-col max-sm:landscape:flex-1 max-sm:landscape:min-h-0 max-sm:landscape:space-y-1">
              <SpiderTopBar
                state={state}
                elapsed={elapsed}
                onUndo={undo}
                onHint={showHintAction}
                onRestart={restartGame}
                onOpenGameMenu={openGameMenu}
                onRules={() => setShowRules(true)}
                canUndo={canUndo}
              />

              <section
                className="rounded-2xl border p-3 sm:p-5 space-y-4 shadow-[inset_0_2px_10px_rgba(0,0,0,0.04)] max-sm:landscape:flex-1 max-sm:landscape:flex max-sm:landscape:flex-col max-sm:landscape:min-h-0 max-sm:landscape:p-2 max-sm:landscape:space-y-1 max-sm:landscape:rounded-xl"
                style={{
                  backgroundColor: SPIDER_FELT,
                  borderColor: SPIDER_FELT_BORDER,
                }}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between touch-manipulation max-sm:landscape:flex-row max-sm:landscape:items-center max-sm:landscape:justify-between max-sm:landscape:gap-2 max-sm:landscape:shrink-0">
                  <div
                    className={`shrink-0 max-sm:landscape:scale-[0.85] max-sm:landscape:origin-left ${hint?.type === "deal_stock" ? "animate-[spiderHintPulse_1.2s_ease-in-out_infinite] rounded-xl" : ""}`}
                  >
                    <SpiderStock state={state} onDeal={handleDeal} dealing={dealing} />
                  </div>
                  <div className="min-w-0 w-full sm:w-auto sm:max-w-[55%] max-sm:landscape:w-auto max-sm:landscape:max-w-none max-sm:landscape:scale-[0.85] max-sm:landscape:origin-right">
                    <SpiderFoundation
                      completedRuns={state.completedRuns}
                      completedSuits={completedSuits}
                      pulseIndex={pulseFoundationIndex}
                    />
                  </div>
                </div>

                {state.phase === "stuck" && <SpiderStuckBanner onRestart={restartGame} />}

                {message && (
                  <p className="text-sm text-amber-950 bg-amber-50 rounded-xl px-4 py-2.5 border border-amber-200/80 shadow-sm max-sm:landscape:hidden">
                    {message}
                  </p>
                )}

                <div className="min-w-0 max-sm:landscape:flex-1 max-sm:landscape:min-h-0">
                  <SpiderTableau
                    columns={state.columns}
                    selection={selection}
                    legalTargets={legalTargets}
                    hint={hint}
                    onSelect={(fromColumn, fromIndex) =>
                      setSelection((prev) =>
                        prev?.fromColumn === fromColumn && prev.fromIndex === fromIndex
                          ? null
                          : { fromColumn, fromIndex },
                      )
                    }
                    onMoveToColumn={handleMoveToColumn}
                  />
                </div>
              </section>
            </div>
          )}

          {(showMenu || !state) && !showVictory && (
            <>
              {message && !state && (
                <p className="text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl px-4 py-3 max-w-lg mx-auto text-center shadow-sm">
                  {message}
                </p>
              )}
              <SpiderMainMenu
                onStartGame={handleNewGame}
                onShowRules={() => setShowRules(true)}
                onResume={state?.phase === "playing" ? resumeGame : undefined}
                onQuit={state ? finishGame : undefined}
                pausedGame={
                  showMenu && state?.phase === "playing"
                    ? {
                        suitMode: state.suitMode,
                        moves: state.moves,
                        completedRuns: state.completedRuns,
                      }
                    : null
                }
                stats={stats}
              />
            </>
          )}
        </div>
      </main>
    </PdfToolLayout>
  );
}
