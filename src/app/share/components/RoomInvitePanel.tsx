"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import Link from "next/link";
import { CODE_SCANNER_SIMPLE_URL } from "@/lib/code-scanner/url-utils";
import { buildShareInviteUrl } from "@/lib/share/urls";

interface Props {
  roomCode: string;
  inviteToken: string;
  returnTo: string;
}

export function RoomInvitePanel({ roomCode, inviteToken, returnTo }: Props) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const inviteUrl = buildShareInviteUrl(inviteToken);

  useEffect(() => {
    void QRCode.toDataURL(inviteUrl, { margin: 2, width: 220 }).then(setQrDataUrl);
  }, [inviteUrl]);

  const scanHref = `${CODE_SCANNER_SIMPLE_URL}&returnTo=${encodeURIComponent(returnTo)}`;

  async function copyText(text: string, label: string) {
    await navigator.clipboard.writeText(text);
    alert(`${label} скопирован`);
  }

  async function handleShare() {
    if (navigator.share) {
      try {
        await navigator.share({ title: "QHub Share", text: `Код: ${roomCode}`, url: inviteUrl });
        return;
      } catch {
        /* fall through */
      }
    }
    await copyText(inviteUrl, "Ссылка");
  }

  return (
    <div className="flex flex-col items-center gap-4 p-4">
      {qrDataUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qrDataUrl} alt="QR-код комнаты" className="rounded-xl border border-gray-200" />
      )}

      <div className="w-full max-w-xs space-y-2">
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-center">
          <p className="text-[11px] text-gray-500 mb-1">Код комнаты</p>
          <p className="text-lg font-mono font-semibold tracking-wide">{roomCode}</p>
        </div>

        <button
          type="button"
          onClick={() => void copyText(roomCode, "Код")}
          className="w-full rounded-xl border border-gray-200 py-2.5 text-sm font-medium hover:bg-gray-50"
        >
          Копировать код
        </button>

        <button
          type="button"
          onClick={() => void copyText(inviteUrl, "Ссылка")}
          className="w-full rounded-xl border border-gray-200 py-2.5 text-sm font-medium hover:bg-gray-50"
        >
          Копировать ссылку
        </button>

        <button
          type="button"
          onClick={() => void handleShare()}
          className="w-full rounded-xl bg-gray-900 text-white py-2.5 text-sm font-semibold"
        >
          Поделиться
        </button>
      </div>

      <Link href={scanHref} className="text-sm text-sky-600 underline">
        Сканировать QR
      </Link>

      <p className="text-xs text-gray-500 text-center max-w-xs">
        Комната действует до 60 минут. Максимум 2 участника.
      </p>
    </div>
  );
}
