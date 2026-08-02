"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PdfToolLayout } from "@/app/tools/_pdf-shared/PdfToolLayout";
import {
  adjustClockTime,
  createInitialState,
  enterClockMode,
  exitClockMode,
  isAlarmRinging,
  setClockEdit,
  setMode,
  setShowHighScore,
  setSpeedLevel,
  startGame,
  steer,
  tick,
  updateHighScore,
} from "@/lib/games/autoslalom/engine";
import type { AutoslalomHighScores, AutoslalomMode, AutoslalomState } from "@/lib/games/autoslalom/types";
import {
  DEFAULT_AUTOSLOALOM_DATA,
  loadAutoslalomData,
  saveAutoslalomData,
} from "@/lib/games/storage";
import { DeviceFrame } from "./components/DeviceFrame";
import { useGameLoop } from "./hooks/useGameLoop";

export default function AutoslalomClient() {
  const [state, setState] = useState<AutoslalomState>(() => createInitialState());
  const [highScores, setHighScores] = useState<AutoslalomHighScores>(DEFAULT_AUTOSLOALOM_DATA.highScores);
  const [now, setNow] = useState(() => new Date());
  const stateRef = useRef(state);
  stateRef.current = state;

  const highScore = highScores[state.mode];
  const alarmRinging = isAlarmRinging(state, now);
  const standMode = state.phase === "clock";

  useEffect(() => {
    void loadAutoslalomData().then((data) => {
      setHighScores(data.highScores);
      setState(createInitialState({
        mode: data.mode,
        speedLevel: data.speedLevel,
        clock: data.clock,
      }));
    });
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    void saveAutoslalomData({
      highScores,
      clock: state.clock,
      speedLevel: state.speedLevel,
      mode: state.mode,
    });
  }, [highScores, state.clock, state.speedLevel, state.mode]);

  useEffect(() => {
    if (state.phase !== "gameover") return;
    setHighScores((prev) => updateHighScore(prev, state.mode, state.score));
  }, [state.phase, state.mode, state.score]);

  const patchState = useCallback((updater: (s: AutoslalomState) => AutoslalomState) => {
    setState((prev) => updater(prev));
  }, []);

  useGameLoop(state.phase === "playing" || state.phase === "crash", (dtMs) => {
    setState((prev) => tick(prev, dtMs));
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      const s = stateRef.current;
      if (s.phase === "playing" || s.phase === "crash") {
        if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
          event.preventDefault();
          patchState((prev) => steer(prev, "left"));
        }
        if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") {
          event.preventDefault();
          patchState((prev) => steer(prev, "right"));
        }
      } else if (s.phase === "idle" || s.phase === "gameover") {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          patchState((prev) => startGame(prev));
        }
        if (event.key === "ArrowUp") patchState((prev) => setSpeedLevel(prev, 1));
        if (event.key === "ArrowDown") patchState((prev) => setSpeedLevel(prev, -1));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [patchState]);

  const handleSwipe = useCallback(
    (direction: "left" | "right") => {
      if (stateRef.current.phase === "playing") {
        patchState((prev) => steer(prev, direction));
      }
    },
    [patchState],
  );

  return (
    <PdfToolLayout
      title="Автослалом"
      shellClassName="min-h-[100dvh] flex flex-col bg-neutral-200 dark:bg-neutral-900"
      badge={false}
    >
      <main className="flex-1 overflow-y-auto overscroll-y-contain px-3 py-4 sm:py-6">
        <div className="mx-auto max-w-md space-y-3">
          <Link
            href="/tools/games"
            className="inline-flex text-xs text-gray-500 hover:text-gray-800 dark:hover:text-gray-300"
          >
            ← Все игры
          </Link>

          <DeviceFrame
            state={state}
            highScore={highScore}
            alarmRinging={alarmRinging}
            now={now}
            standMode={standMode}
            onSpeedUp={() => patchState((prev) => setSpeedLevel(prev, 1))}
            onSpeedDown={() => patchState((prev) => setSpeedLevel(prev, -1))}
            onSteerLeft={() => patchState((prev) => steer(prev, "left"))}
            onSteerRight={() => patchState((prev) => steer(prev, "right"))}
            onStart={() => patchState((prev) => startGame(prev))}
            onStartHold={(held) => patchState((prev) => setShowHighScore(prev, held))}
            onModeA={() => patchState((prev) => setMode(prev, "A"))}
            onModeB={() => patchState((prev) => setMode(prev, "B"))}
            onClock={() => patchState((prev) => enterClockMode(prev))}
            onClockExit={() => patchState((prev) => exitClockMode(prev))}
            onSetTime={() => patchState((prev) => setClockEdit(prev, "time"))}
            onSetAlarm={() => patchState((prev) => setClockEdit(prev, "alarm"))}
            onAdjustTime={(delta) => patchState((prev) => adjustClockTime(prev, delta))}
          />

          {/* Mobile swipe zone */}
          {state.phase === "playing" && (
            <div
              className="grid grid-cols-2 gap-2 sm:hidden"
              role="group"
              aria-label="Свайп-управление"
            >
              <button
                type="button"
                className="touch-manipulation min-h-[56px] rounded-xl bg-[#c41e3a]/90 text-white font-semibold active:scale-[0.98]"
                onPointerDown={() => handleSwipe("left")}
              >
                ← Влево
              </button>
              <button
                type="button"
                className="touch-manipulation min-h-[56px] rounded-xl bg-[#c41e3a]/90 text-white font-semibold active:scale-[0.98]"
                onPointerDown={() => handleSwipe("right")}
              >
                Вправо →
              </button>
            </div>
          )}

          <details className="rounded-xl border border-gray-300 dark:border-gray-700 bg-white/80 dark:bg-gray-900/80 p-3 text-xs text-gray-600 dark:text-gray-400">
            <summary className="cursor-pointer font-semibold text-gray-800 dark:text-gray-200">
              Правила «Электроника ИМ-23»
            </summary>
            <ul className="mt-2 space-y-1 list-disc pl-4 leading-relaxed">
              <li>Три полосы — уклоняйтесь от барьеров. За каждый барьер +1 очко (макс. 2999).</li>
              <li>3 автомобиля; столкновение отнимает один. Бонусы на 200, 500, 1000, 1200, 1500, 2200, 2500, 2999.</li>
              <li>Скорость растёт до 1200 очков. Уровень скорости 1–16 задаётся кнопками «Скорость».</li>
              <li>Игра А — одиночные и противоположные барьеры. Игра Б — добавляет соседние пары (нужен двойной тап).</li>
              <li>«Время» — часы 24 ч и будильник. Удерживайте «Запуск» для просмотра рекорда.</li>
            </ul>
          </details>
        </div>
      </main>
    </PdfToolLayout>
  );
}
