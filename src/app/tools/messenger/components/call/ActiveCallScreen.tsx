"use client";

import type { ReactNode } from "react";
import { CallStatusText } from "./CallStatusText";
import { MicIcon, MicOffIcon, PhoneDownIcon, SpeakerIcon, SpeakerOffIcon } from "./CallControlIcons";

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function peerInitial(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) return "?";
  return trimmed.charAt(0).toUpperCase();
}

interface Props {
  peerTitle: string;
  phase: string;
  durationSec: number;
  muted: boolean;
  speakerOn: boolean;
  errorMessage?: string | null;
  onToggleMute: () => void;
  onToggleSpeaker: () => void;
  onHangup: () => void;
}

function ControlButton({
  active,
  danger,
  label,
  onClick,
  children,
}: {
  active?: boolean;
  danger?: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`flex h-14 w-14 items-center justify-center rounded-full transition-colors ${
        danger
          ? "h-[4.5rem] w-[4.5rem] bg-red-500 text-white shadow-lg shadow-red-900/30 hover:bg-red-600"
          : active
            ? "bg-white text-gray-900"
            : "bg-white/10 text-white hover:bg-white/20"
      }`}
    >
      {children}
    </button>
  );
}

export function ActiveCallScreen({
  peerTitle,
  phase,
  durationSec,
  muted,
  speakerOn,
  errorMessage,
  onToggleMute,
  onToggleSpeaker,
  onHangup,
}: Props) {
  const showDuration = phase === "active";

  return (
    <div className="fixed inset-0 z-50 flex flex-col text-white">
      <div
        className="absolute inset-0 bg-[#0b141a]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 25% 20%, rgba(0,168,132,0.12), transparent 45%), radial-gradient(circle at 80% 70%, rgba(255,255,255,0.04), transparent 40%)",
        }}
      />

      <div
        className="relative flex flex-1 flex-col"
        style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}
      >
        <div className="px-6 pt-4 text-center">
          <h2 className="text-2xl font-semibold tracking-tight">{peerTitle}</h2>
          <div className="mt-2 flex flex-col items-center gap-1">
            <CallStatusText phase={phase} errorMessage={errorMessage} variant="dark" />
            {showDuration && (
              <span className="text-base text-gray-300 tabular-nums">{formatDuration(durationSec)}</span>
            )}
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center px-6">
          <div className="flex h-40 w-40 items-center justify-center rounded-full bg-[#1f2c34] ring-1 ring-white/10 shadow-2xl">
            <span className="text-6xl font-light text-[#00a884]">{peerInitial(peerTitle)}</span>
          </div>
        </div>
      </div>

      <div
        className="relative px-4"
        style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto flex max-w-md items-center justify-between rounded-full bg-[#1f2c34]/95 px-5 py-4 shadow-xl ring-1 ring-white/10 backdrop-blur">
          <ControlButton
            active={speakerOn}
            label={speakerOn ? "Выключить громкую связь" : "Включить громкую связь"}
            onClick={onToggleSpeaker}
          >
            {speakerOn ? <SpeakerIcon /> : <SpeakerOffIcon />}
          </ControlButton>

          <ControlButton
            active={muted}
            label={muted ? "Включить микрофон" : "Выключить микрофон"}
            onClick={onToggleMute}
          >
            {muted ? <MicOffIcon /> : <MicIcon />}
          </ControlButton>

          <ControlButton danger label="Завершить звонок" onClick={onHangup}>
            <PhoneDownIcon />
          </ControlButton>
        </div>
      </div>
    </div>
  );
}
