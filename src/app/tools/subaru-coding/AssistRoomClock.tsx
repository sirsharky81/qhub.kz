"use client";

import { useEffect, useState } from "react";
import { assistRemainingMs, formatAssistRemaining } from "@/lib/subaru-assist/room-clock";

export function AssistRoomClock({ expiresAt }: { expiresAt: number | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const left = expiresAt ? assistRemainingMs(expiresAt, now) : null;
  const expired = left === 0;

  return (
    <>
      <div className="text-gray-500">Комната</div>
      <div className={`font-mono text-sm font-bold ${expired ? "text-red-700" : "text-gray-900"}`}>
        {left === null ? "—" : formatAssistRemaining(left)}
      </div>
    </>
  );
}
