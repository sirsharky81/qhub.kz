"use client";

import { useEffect, useState } from "react";
import { buildJoinUrl } from "@/lib/lotto-rooms/client";

interface LottoPlayerQrProps {
  roomCode: string;
  playerId: string;
  joinToken: string;
  joinCode: string;
}

export function LottoPlayerQr({ roomCode, playerId, joinToken, joinCode }: LottoPlayerQrProps) {
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const joinUrl =
    typeof window !== "undefined"
      ? buildJoinUrl(window.location.origin, roomCode, playerId, joinToken)
      : "";

  useEffect(() => {
    if (!joinUrl) return;
    let cancelled = false;
    void (async () => {
      const QRCode = (await import("qrcode")).default;
      const url = await QRCode.toDataURL(joinUrl, {
        errorCorrectionLevel: "M",
        margin: 2,
        width: 160,
      });
      if (!cancelled) setQrUrl(url);
    })();
    return () => {
      cancelled = true;
    };
  }, [joinUrl]);

  return (
    <div className="flex flex-wrap items-start gap-3 pt-1">
      {qrUrl ? (
        <img
          src={qrUrl}
          alt="QR для присоединения"
          className="w-28 h-28 rounded-lg border border-gray-200 dark:border-gray-700 bg-white p-1"
        />
      ) : (
        <div className="w-28 h-28 rounded-lg border border-dashed border-gray-300 dark:border-gray-600" />
      )}
      <div className="space-y-1 text-[11px] text-gray-600 dark:text-gray-400 min-w-[140px]">
        <p>
          Код комнаты:{" "}
          <strong className="font-mono text-gray-900 dark:text-gray-100">{roomCode}</strong>
        </p>
        <p>
          Код игрока:{" "}
          <strong className="font-mono text-gray-900 dark:text-gray-100">{joinCode}</strong>
        </p>
        <p className="text-gray-500 leading-snug">Отсканируйте QR или введите коды на вкладке «Присоединиться»</p>
      </div>
    </div>
  );
}
