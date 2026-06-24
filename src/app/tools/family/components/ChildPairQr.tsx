"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

interface Props {
  qrUrl: string;
  childName: string;
}

export function ChildPairQr({ qrUrl, childName }: Props) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    void QRCode.toDataURL(qrUrl, { margin: 2, width: 220 }).then(setQrDataUrl);
  }, [qrUrl]);

  async function handleShare() {
    const text = `${childName} приглашает в семью. Откройте ссылку в приложении «Семья → Родитель» и подтвердите привязку.`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Привязка: ${childName}`,
          text,
          url: qrUrl,
        });
        return;
      } catch {
        /* cancelled or unsupported fields */
      }
    }
    await navigator.clipboard.writeText(`${text}\n\n${qrUrl}`);
    alert("Ссылка скопирована");
  }

  return (
    <div className="flex flex-col items-center gap-4 p-4">
      <p className="text-sm font-medium text-gray-700">Покажите этот QR родителю</p>
      <p className="text-xs text-gray-500">{childName}</p>
      {qrDataUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qrDataUrl} alt="QR для родителя" className="rounded-xl border border-gray-200" />
      )}
      <p className="text-xs text-gray-500 text-center max-w-xs">
        QR действует 15 минут. Родитель сканирует его или открывает ссылку в «Семья → Родитель».
      </p>
      <button
        type="button"
        onClick={handleShare}
        className="w-full max-w-xs rounded-xl bg-gray-900 text-white py-2.5 text-sm font-semibold"
      >
        Поделиться ссылкой
      </button>
    </div>
  );
}
