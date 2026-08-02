"use client";

import type { AutoslalomState } from "@/lib/games/autoslalom/types";
import { LcdDisplay } from "./LcdDisplay";
import { DeviceControls, type DeviceControlsProps } from "./DeviceControls";

type DeviceFrameProps = Omit<DeviceControlsProps, "phase" | "speedLevel" | "mode"> & {
  state: AutoslalomState;
  highScore: number;
  alarmRinging: boolean;
  now: Date;
  standMode?: boolean;
};

export function DeviceFrame({
  state,
  highScore,
  alarmRinging,
  now,
  standMode,
  ...controls
}: DeviceFrameProps) {
  return (
    <div
      className={`mx-auto w-full max-w-md transition-transform duration-300 ${standMode ? "perspective-[800px]" : ""}`}
    >
      <div className={standMode ? "[transform:rotateX(12deg)] origin-bottom" : ""}>
        {/* Wire stand */}
        {standMode && (
          <div className="flex justify-center mb-[-2px]" aria-hidden>
            <div className="w-[70%] h-16 border-x-2 border-b-2 border-gray-400 rounded-b-lg bg-transparent" />
          </div>
        )}

        <div className="rounded-2xl bg-[#d8d8d0] border border-gray-400 shadow-lg px-3 py-3 sm:px-4 sm:py-4">
          {/* Header branding */}
          <div className="flex items-center justify-between mb-2 px-1">
            <div className="flex items-center gap-1.5">
              <div className="w-7 h-7 rounded-full border-2 border-gray-700 flex items-center justify-center text-[9px] font-bold text-gray-800">
                ИМ
              </div>
            </div>
            <h2 className="text-sm sm:text-base font-bold text-[#c41e3a] tracking-wider uppercase">
              Автослалом
            </h2>
            <div className="w-7" />
          </div>

          {/* LCD bezel */}
          <div className="rounded-lg bg-[#b8c4b4] p-1.5 shadow-inner border border-gray-500/30">
            <LcdDisplay state={state} highScore={highScore} alarmRinging={alarmRinging} now={now} />
          </div>

          <p className="text-center text-[10px] font-bold tracking-[0.2em] text-gray-800 mt-2 uppercase">
            Электроника
          </p>

          <div className="mt-3">
            <DeviceControls phase={state.phase} speedLevel={state.speedLevel} mode={state.mode} {...controls} />
          </div>

          {state.phase === "gameover" && (
            <p className="mt-2 text-center text-xs text-gray-700 font-medium">
              Игра окончена · очки {state.score}
            </p>
          )}
          {state.phase === "idle" && state.showHighScore && (
            <p className="mt-2 text-center text-[10px] text-gray-600">Рекорд игры {state.mode}</p>
          )}
          {state.phase === "clock" && state.clockEdit !== "none" && (
            <p className="mt-2 text-center text-[10px] text-gray-600">
              {state.clockEdit === "time" ? "Настройка времени (24 ч)" : "Настройка будильника"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
