"use client";

import { useRef } from "react";
import type { AutoslalomPhase } from "@/lib/games/autoslalom/types";

interface DeviceButtonProps {
  label?: string;
  sublabel?: string;
  onPress?: () => void;
  onRelease?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  size?: "large" | "small" | "pinhole";
  className?: string;
  children?: React.ReactNode;
}

function DeviceButton({
  label,
  sublabel,
  onPress,
  onRelease,
  onLongPress,
  disabled,
  size = "large",
  className = "",
  children,
}: DeviceButtonProps) {
  const longPressTimer = useRef<number | null>(null);

  const handlePointerDown = () => {
    if (disabled) return;
    onPress?.();
    if (onLongPress) {
      longPressTimer.current = window.setTimeout(() => onLongPress(), 600);
    }
  };

  const handlePointerUp = () => {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    onRelease?.();
  };

  const sizeClass =
    size === "large"
      ? "min-h-[52px] min-w-[52px] rounded-full"
      : size === "small"
        ? "min-h-[36px] min-w-[36px] rounded-full text-[9px]"
        : "min-h-[18px] min-w-[18px] rounded-full";

  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className={`touch-manipulation select-none active:scale-95 transition-transform bg-[#c41e3a] text-white shadow-[inset_0_-3px_0_rgba(0,0,0,0.25),0_2px_4px_rgba(0,0,0,0.15)] disabled:opacity-40 disabled:active:scale-100 ${sizeClass} ${className}`}
    >
      {children ?? (
        <span className="flex flex-col items-center leading-none px-1">
          {label && <span className="font-semibold">{label}</span>}
          {sublabel && <span className="text-[8px] opacity-90 mt-0.5">{sublabel}</span>}
        </span>
      )}
    </button>
  );
}

export interface DeviceControlsProps {
  phase: AutoslalomPhase;
  speedLevel: number;
  mode: "A" | "B";
  onSpeedUp: () => void;
  onSpeedDown: () => void;
  onSteerLeft: () => void;
  onSteerRight: () => void;
  onStart: () => void;
  onStartHold: (held: boolean) => void;
  onModeA: () => void;
  onModeB: () => void;
  onClock: () => void;
  onClockExit: () => void;
  onSetTime: () => void;
  onSetAlarm: () => void;
  onAdjustTime: (delta: number) => void;
}

export function DeviceControls({
  phase,
  speedLevel,
  mode,
  onSpeedUp,
  onSpeedDown,
  onSteerLeft,
  onSteerRight,
  onStart,
  onStartHold,
  onModeA,
  onModeB,
  onClock,
  onClockExit,
  onSetTime,
  onSetAlarm,
  onAdjustTime,
}: DeviceControlsProps) {
  const playing = phase === "playing" || phase === "crash";
  const idle = phase === "idle" || phase === "gameover";
  const clock = phase === "clock";

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] gap-2 sm:gap-3 items-stretch px-1">
      {/* Left — Speed */}
      <div className="flex flex-col items-center gap-1.5">
        <span className="text-[10px] font-bold tracking-wide text-gray-700 uppercase">Скорость</span>
        <div className="flex flex-col gap-2 flex-1 justify-center">
          <DeviceButton
            disabled={playing}
            onPress={() => (clock ? onAdjustTime(1) : onSpeedUp())}
            aria-label={clock ? "Минуты +" : "Скорость выше"}
          />
          <DeviceButton
            disabled={playing}
            onPress={() => (clock ? onAdjustTime(-1) : onSpeedDown())}
            aria-label={clock ? "Минуты −" : "Скорость ниже"}
          />
        </div>
        {!playing && !clock && (
          <span className="text-[11px] font-mono text-gray-600 tabular-nums">{speedLevel}</span>
        )}
        <span className="text-gray-800 text-lg leading-none self-start" aria-hidden>
          ◀
        </span>
      </div>

      {/* Center spacer */}
      <div className="w-2" />

      {/* Right — Mode + Start */}
      <div className="flex flex-col items-end gap-1.5">
        <div className="flex items-start gap-1.5 w-full justify-end">
          <div className="flex flex-col gap-1.5">
            <DeviceButton
              size="small"
              disabled={playing}
              onPress={onModeA}
              label="игра"
              sublabel="А"
              className={mode === "A" && !clock ? "ring-2 ring-gray-800 ring-offset-1" : ""}
            />
            <DeviceButton
              size="small"
              disabled={playing}
              onPress={onModeB}
              label="игра"
              sublabel="Б"
              className={mode === "B" && !clock ? "ring-2 ring-gray-800 ring-offset-1" : ""}
            />
            <DeviceButton
              size="small"
              disabled={playing}
              onPress={clock ? onClockExit : onClock}
              label="время"
              className={clock ? "ring-2 ring-gray-800 ring-offset-1" : ""}
            />
          </div>
          <div className="flex flex-col gap-2 pt-1">
            <DeviceButton size="pinhole" disabled={!clock} onPress={onSetTime} aria-label="Настройка времени" />
            <DeviceButton size="pinhole" disabled={!clock} onPress={onSetAlarm} aria-label="Настройка будильника" />
          </div>
        </div>

        <span className="text-[10px] font-bold tracking-wide text-gray-700 uppercase self-center">
          {playing ? "Управление" : "Запуск"}
        </span>
        <div className="flex flex-col gap-2 flex-1 justify-center items-end w-full">
          <DeviceButton
            onPress={() => {
              if (playing) onSteerLeft();
              else if (idle) onStart();
            }}
            onLongPress={() => {
              if (idle) onStartHold(true);
            }}
            onRelease={() => onStartHold(false)}
            aria-label={playing ? "Влево" : "Старт / рекорд"}
          />
          <DeviceButton
            onPress={() => {
              if (playing) onSteerRight();
              else if (idle) onStart();
            }}
            onLongPress={() => {
              if (idle) onStartHold(true);
            }}
            onRelease={() => onStartHold(false)}
            aria-label={playing ? "Вправо" : "Старт / рекорд"}
          />
        </div>
        <span className="text-gray-800 text-lg leading-none self-end" aria-hidden>
          ▶
        </span>
      </div>
    </div>
  );
}
