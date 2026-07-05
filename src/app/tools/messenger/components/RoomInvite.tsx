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

  async function copyRoomCode() {
    await navigator.clipboard.writeText(roomId);
    alert("Код комнаты скопирован");
  }

  async function copyInviteLink() {
    await navigator.clipboard.writeText(joinUrl);
    alert("Ссылка приглашения скопирована");
  }

  return (
    <div className="flex flex-col items-center gap-4 p-4">
      <p className="text-3xl font-mono font-bold tracking-widest text-gray-900">{roomId}</p>
      {qrDataUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qrDataUrl} alt={`QR комнаты ${roomId}`} className="rounded-xl border border-gray-200" />
      )}
      <p className="text-xs text-gray-500 text-center max-w-xs">
        Для входа достаточно короткого кода комнаты. QR/ссылка — быстрый вариант передачи.
      </p>
      <div className="grid w-full max-w-xs gap-2">
        <button
          type="button"
          onClick={copyRoomCode}
          className="w-full rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-semibold"
        >
          Скопировать код комнаты
        </button>
        <button
          type="button"
          onClick={copyInviteLink}
          className="w-full rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-semibold"
        >
          Скопировать ссылку
        </button>
        <button
          type="button"
          onClick={handleShare}
          className="w-full rounded-xl bg-gray-900 text-white py-2.5 text-sm font-semibold"
        >
          Поделиться
        </button>
      </div>
    </div>
  );
}
