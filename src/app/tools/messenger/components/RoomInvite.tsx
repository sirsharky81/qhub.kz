"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { buildRoomJoinUrl } from "@/lib/messenger/crypto";

interface Props {
  roomId: string;
  roomKey: string;
}

export function RoomInvite({ roomId, roomKey }: Props) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const joinUrl = buildRoomJoinUrl(roomId, roomKey);

  useEffect(() => {
    void QRCode.toDataURL(joinUrl, { margin: 2, width: 220 }).then(setQrDataUrl);
  }, [joinUrl]);

  async function handleShare() {
    if (navigator.share) {
      try {
        await navigator.share({ title: `Комната ${roomId}`, text: joinUrl, url: joinUrl });
        return;
      } catch {
        /* fall through */
      }
    }
    await navigator.clipboard.writeText(joinUrl);
    alert("Ссылка скопирована");
  }

  return (
    <div className="flex flex-col items-center gap-4 p-4">
      <p className="text-3xl font-mono font-bold tracking-widest text-gray-900">{roomId}</p>
      {qrDataUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qrDataUrl} alt={`QR комнаты ${roomId}`} className="rounded-xl border border-gray-200" />
      )}
      <p className="text-xs text-gray-500 text-center max-w-xs">
        Ключ шифрования в QR и ссылке. Не передавайте только код комнаты без QR.
      </p>
      <button
        type="button"
        onClick={handleShare}
        className="w-full max-w-xs rounded-xl bg-gray-900 text-white py-2.5 text-sm font-semibold"
      >
        Поделиться
      </button>
    </div>
  );
}
