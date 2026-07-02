"use client";

import type { ReactNode } from "react";
import { CallStatusText } from "./CallStatusText";
import { PhoneDownIcon, PhoneIcon } from "./CallControlIcons";

interface Props {
  peerTitle: string;
  onAccept: () => void;
  onDecline: () => void;
}

function peerInitial(title: string): string | null {
  const letter = title.trim().match(/[\p{L}]/u)?.[0];
  return letter ? letter.toUpperCase() : null;
}

function ActionButton({
  label,
  variant,
  onClick,
  children,
}: {
  label: string;
  variant: "accept" | "decline";
  onClick: () => void;
  children: ReactNode;
}) {
  const isAccept = variant === "accept";
  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={`flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full shadow-lg transition-transform active:scale-95 ${
          isAccept
            ? "bg-[#00a884] text-white shadow-emerald-900/40 hover:bg-[#06cf9c]"
            : "bg-red-500 text-white shadow-red-900/40 hover:bg-red-600"
        }`}
      >
        {children}
      </button>
      <span className="text-sm font-medium text-white/75">{label}</span>
    </div>
  );
}

export function IncomingCallOverlay({ peerTitle, onAccept, onDecline }: Props) {
  const initial = peerInitial(peerTitle);

  return (
    <div className="fixed inset-0 z-50 flex flex-col text-white">
      <div
        className="absolute inset-0 bg-[#0b141a]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 25% 20%, rgba(0,168,132,0.14), transparent 45%), radial-gradient(circle at 80% 70%, rgba(255,255,255,0.04), transparent 40%)",
        }}
      />

      <div
        className="relative flex flex-1 flex-col"
        style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}
      >
        <div className="px-6 pt-6 text-center">
          <h2 className="text-2xl font-semibold tracking-tight">{peerTitle}</h2>
          <div className="mt-2">
            <CallStatusText phase="incoming" variant="dark" />
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center px-6">
          <div className="relative flex h-44 w-44 items-center justify-center">
            <span
              className="absolute inset-0 rounded-full bg-[#00a884]/25 animate-ping"
              style={{ animationDuration: "2.4s" }}
              aria-hidden
            />
            <span
              className="absolute inset-3 rounded-full bg-[#00a884]/15 animate-ping"
              style={{ animationDuration: "2.4s", animationDelay: "0.6s" }}
              aria-hidden
            />
            <div className="relative flex h-40 w-40 items-center justify-center rounded-full bg-[#1f2c34] ring-1 ring-white/10 shadow-2xl">
              {initial ? (
                <span className="text-6xl font-light text-[#00a884]">{initial}</span>
              ) : (
                <PhoneIcon className="h-16 w-16 text-[#00a884]" />
              )}
            </div>
          </div>
        </div>
      </div>

      <div
        className="relative px-6"
        style={{ paddingBottom: "max(2rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto flex w-full max-w-md items-start justify-between px-4 sm:px-8">
          <ActionButton label="Отклонить" variant="decline" onClick={onDecline}>
            <PhoneDownIcon />
          </ActionButton>
          <ActionButton label="Принять" variant="accept" onClick={onAccept}>
            <PhoneIcon className="h-7 w-7" />
          </ActionButton>
        </div>
      </div>
    </div>
  );
}
