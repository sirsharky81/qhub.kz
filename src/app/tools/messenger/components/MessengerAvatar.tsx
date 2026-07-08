"use client";

import { useState } from "react";
import { avatarBgClass, initialFromLabel } from "@/lib/messenger/display";

const SIZE_CLASS = {
  sm: "h-9 w-9 text-sm",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-xl",
  call: "h-40 w-40 text-6xl",
} as const;

interface Props {
  src?: string | null;
  label: string;
  size?: keyof typeof SIZE_CLASS;
  kind?: "user" | "room";
  className?: string;
  seed?: string;
}

export function MessengerAvatar({
  src,
  label,
  size = "sm",
  kind = "user",
  className = "",
  seed,
}: Props) {
  const [broken, setBroken] = useState(false);
  const showImage = Boolean(src) && !broken;
  const initial = initialFromLabel(label);
  const isCall = size === "call";
  const bg = isCall
    ? "bg-[#1f2c34] text-[#00a884] ring-1 ring-white/10"
    : avatarBgClass(seed || label || kind);

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ${SIZE_CLASS[size]} ${
        showImage && !isCall ? "bg-gray-100" : bg
      } ${className}`}
      aria-hidden
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src!}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : initial ? (
        <span className={isCall ? "font-light" : "font-semibold"}>{initial}</span>
      ) : kind === "room" ? (
        <svg viewBox="0 0 24 24" className="h-[45%] w-[45%] opacity-70" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a3 3 0 1 1 0 6a3 3 0 0 1 0-6M8 8a2.5 2.5 0 1 1 0 5a2.5 2.5 0 0 1 0-5" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.5 18.5c.2-2.2 2.1-3.5 4.2-3.5c1.3 0 2.5.4 3.3 1.1M2 18.5c.3-2.1 2.2-3.5 4.5-3.5s4.2 1.4 4.5 3.5" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-[45%] w-[45%] opacity-70" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 1 1-8 0a4 4 0 0 1 8 0ZM4 20a8 8 0 0 1 16 0" />
        </svg>
      )}
    </span>
  );
}
