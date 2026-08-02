"use client";

import type { AutoslalomState } from "@/lib/games/autoslalom/types";
import { DEVICE } from "@/lib/games/autoslalom/constants";
import { LcdSvgDisplay } from "./LcdSvgDisplay";
import { DeviceControls, type DeviceControlsProps } from "./DeviceControls";

type DeviceFrameProps = Omit<DeviceControlsProps, "phase" | "speedLevel" | "mode" | "screen"> & {
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
    <div className="mx-auto w-full max-w-[640px] select-none">
      {standMode && (
        <div className="flex justify-center mb-[-1px]" aria-hidden>
          <svg viewBox="0 0 200 40" className="w-[55%] h-8 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 2 L20 38 L180 38 L180 2" />
            <path d="M20 2 Q100 18 180 2" strokeDasharray="4 3" opacity="0.5" />
          </svg>
        </div>
      )}

      <div
        className="relative rounded-[18px] px-[clamp(8px,2vw,14px)] py-[clamp(8px,2vw,12px)]"
        style={{
          background: `linear-gradient(180deg, ${DEVICE.body} 0%, ${DEVICE.bodyEdge} 100%)`,
          boxShadow: "0 8px 24px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.55)",
          border: `1px solid ${DEVICE.bodyShadow}`,
        }}
      >
        <div
          className="absolute top-[clamp(8px,2vw,12px)] left-[clamp(10px,2.5vw,16px)] w-[clamp(24px,6vw,32px)] h-[clamp(24px,6vw,32px)] rounded-full flex items-center justify-center border-[2px] font-bold text-[clamp(7px,1.8vw,9px)]"
          style={{ borderColor: DEVICE.label, color: DEVICE.label }}
        >
          ИМ
        </div>

        <div className="mt-1 pt-[clamp(18px,4vw,24px)]">
          <DeviceControls
            phase={state.phase}
            speedLevel={state.speedLevel}
            mode={state.mode}
            screen={<LcdSvgDisplay state={state} highScore={highScore} alarmRinging={alarmRinging} now={now} />}
            {...controls}
          />
        </div>

        {state.phase === "gameover" && (
          <p className="mt-2 text-center text-[10px] font-medium opacity-70" style={{ color: DEVICE.label }}>
            Конец игры · {state.score} очков
          </p>
        )}
        {state.phase === "idle" && state.showHighScore && (
          <p className="mt-1 text-center text-[9px] opacity-60" style={{ color: DEVICE.label }}>
            Рекорд · игра {state.mode}
          </p>
        )}
        {state.phase === "clock" && state.clockEdit !== "none" && (
          <p className="mt-1 text-center text-[9px] opacity-60" style={{ color: DEVICE.label }}>
            {state.clockEdit === "time" ? "Настройка времени (24 ч)" : "Настройка будильника"}
          </p>
        )}
      </div>
    </div>
  );
}
