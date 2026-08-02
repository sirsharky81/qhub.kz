"use client";

import { useRef, type CSSProperties, type ReactNode } from "react";
import { DEVICE } from "@/lib/games/autoslalom/constants";
import type { AutoslalomPhase } from "@/lib/games/autoslalom/types";

function RedButton({
  onPress,
  onRelease,
  onLongPress,
  disabled,
  size = "large",
  style,
  className = "",
  children,
}: {
  onPress?: () => void;
  onRelease?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  size?: "large" | "small" | "pinhole";
  style?: CSSProperties;
  className?: string;
  children?: ReactNode;
}) {
  const timer = useRef<number | null>(null);

  const down = () => {
    if (disabled) return;
    onPress?.();
    if (onLongPress) timer.current = window.setTimeout(onLongPress, 550);
  };
  const up = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    onRelease?.();
  };

  const dims =
    size === "large"
      ? "w-[clamp(44px,11vw,58px)] h-[clamp(44px,11vw,58px)] rounded-full"
      : size === "small"
        ? "w-[clamp(34px,8vw,42px)] h-[clamp(22px,5.5vw,28px)] rounded-full"
        : "w-[10px] h-[10px] rounded-full";

  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={down}
      onPointerUp={up}
      onPointerLeave={up}
      onPointerCancel={up}
      className={`touch-manipulation select-none active:translate-y-[1px] disabled:opacity-35 ${dims} ${className}`}
      style={{
        background: `radial-gradient(circle at 35% 30%, ${DEVICE.buttonHighlight}, ${DEVICE.button} 55%, ${DEVICE.buttonDark})`,
        boxShadow: "inset 0 -3px 0 rgba(0,0,0,0.28), 0 2px 3px rgba(0,0,0,0.18)",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export interface DeviceControlsProps {
  phase: AutoslalomPhase;
  speedLevel: number;
  mode: "A" | "B";
  screen: ReactNode;
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
  screen,
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

  const pinStyle: CSSProperties = {
    background: DEVICE.pinhole,
    boxShadow: "inset 0 1px 2px rgba(0,0,0,0.55)",
  };

  return (
    <div className="grid grid-cols-[auto_1fr_auto] gap-[clamp(4px,1.2vw,8px)] items-stretch">
      {/* LEFT — СКОРОСТЬ */}
      <div className="flex flex-col items-center justify-between py-1 min-w-[clamp(52px,14vw,72px)]">
        <span
          className="text-[clamp(7px,1.8vw,9px)] font-bold tracking-[0.08em] uppercase"
          style={{ color: DEVICE.label }}
        >
          Скорость
        </span>
        <div className="flex flex-col items-center gap-[clamp(6px,1.5vw,10px)] flex-1 justify-center">
          <RedButton
            onPress={() => (clock ? onAdjustTime(1) : playing ? onSteerLeft() : onSpeedUp())}
            aria-label={playing ? "Влево" : clock ? "Минуты +" : "Скорость +"}
          />
          <RedButton
            disabled={false}
            onPress={() => (clock ? onAdjustTime(-1) : playing ? onSteerLeft() : onSpeedDown())}
            aria-label={playing ? "Влево" : clock ? "Минуты −" : "Скорость −"}
          />
        </div>
        {!playing && !clock && (
          <span className="text-[10px] font-mono tabular-nums opacity-70" style={{ color: DEVICE.label }}>
            {speedLevel}
          </span>
        )}
        <span className="text-[clamp(10px,2.5vw,14px)] self-start pl-0.5" style={{ color: DEVICE.label }} aria-hidden>
          ◀
        </span>
      </div>

      {/* CENTER — экран */}
      <div className="flex flex-col min-w-0">
        <h1
          className="text-center font-bold uppercase tracking-[0.18em] mb-[clamp(3px,0.8vw,6px)] leading-none"
          style={{ color: DEVICE.title, fontSize: "clamp(11px, 2.8vw, 15px)" }}
        >
          Автослалом
        </h1>
        <div
          className="flex-1 rounded-[10px] p-[clamp(4px,1vw,7px)] min-h-[clamp(120px,32vw,180px)] aspect-[1.35/1]"
          style={{
            background: "linear-gradient(145deg, #a4a79c, #70756e)",
            boxShadow: "inset 2px 2px 4px rgba(0,0,0,0.38), 0 1px 0 rgba(255,255,255,0.5)",
          }}
        >
          <div
            className="w-full h-full rounded-[5px] overflow-hidden border border-black/45"
            style={{ background: "#a8b89a", boxShadow: "inset 0 0 7px rgba(0,0,0,0.45)" }}
          >
            {screen}
          </div>
        </div>
        <p
          className="text-center font-bold uppercase mt-[clamp(4px,1vw,7px)] tracking-[0.35em] leading-none"
          style={{ color: DEVICE.label, fontSize: "clamp(8px, 2vw, 11px)" }}
        >
          Электроника
        </p>
      </div>

      {/* RIGHT — режимы + ЗАПУСК */}
      <div className="flex flex-col items-center justify-between py-1 min-w-[clamp(52px,14vw,72px)]">
        <div className="flex items-start gap-1">
          <div className="flex flex-col gap-[clamp(4px,1vw,6px)]">
            <div className="flex items-center gap-0.5">
              <RedButton size="small" disabled={playing} onPress={onModeA} aria-label="Игра А">
                <span className="text-[6px] leading-none text-white font-semibold text-center">
                  игра<br />А
                </span>
              </RedButton>
              <span className="text-[8px]" aria-hidden>🔔</span>
            </div>
            <div className="flex items-center gap-0.5">
              <RedButton size="small" disabled={playing} onPress={onModeB} aria-label="Игра Б">
                <span className="text-[6px] leading-none text-white font-semibold text-center">
                  игра<br />Б
                </span>
              </RedButton>
              <span className="text-[8px]" aria-hidden>⏰</span>
            </div>
            <RedButton size="small" disabled={playing} onPress={clock ? onClockExit : onClock} aria-label="Время">
              <span className="text-[6px] leading-none text-white font-semibold">время</span>
            </RedButton>
          </div>
          <div className="flex flex-col gap-2 pt-0.5">
            <RedButton size="pinhole" disabled={!clock} onPress={onSetTime} style={pinStyle} aria-label="Настройка времени" />
            <RedButton size="pinhole" disabled={!clock} onPress={onSetAlarm} style={pinStyle} aria-label="Настройка будильника" />
          </div>
        </div>

        <span
          className="text-[clamp(7px,1.8vw,9px)] font-bold tracking-[0.08em] uppercase"
          style={{ color: DEVICE.label }}
        >
          Запуск
        </span>

        <div className="flex flex-col items-center gap-[clamp(6px,1.5vw,10px)] flex-1 justify-center">
          <RedButton
            onPress={() => {
              if (playing) onSteerRight();
              else if (idle) onStart();
            }}
            onLongPress={() => {
              if (idle) onStartHold(true);
            }}
            onRelease={() => onStartHold(false)}
            aria-label={playing ? "Вправо" : "Старт"}
          />
          <RedButton
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

        <span className="text-[clamp(10px,2.5vw,14px)] self-end pr-0.5" style={{ color: DEVICE.label }} aria-hidden>
          ▶
        </span>
      </div>
    </div>
  );
}
