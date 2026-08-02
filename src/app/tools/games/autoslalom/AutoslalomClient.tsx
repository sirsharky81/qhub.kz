"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
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
import type { AutoslalomHighScores, AutoslalomState } from "@/lib/games/autoslalom/types";
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
      setState(
        createInitialState({
          mode: data.mode,
          speedLevel: data.speedLevel,
          clock: data.clock,
        }),
      );
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

  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#3a3a38]">
      <header className="flex items-center justify-between px-4 py-2 shrink-0">
        <Link href="/tools/games" className="text-[11px] text-white/50 hover:text-white/80 transition-colors">
          ← Игры
        </Link>
        <span className="text-[10px] text-white/35 uppercase tracking-widest">Электроника ИМ-23</span>
      </header>

      <main className="flex-1 flex items-center justify-center px-2 py-3 sm:px-4 overscroll-none">
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
      </main>
    </div>
  );
}
