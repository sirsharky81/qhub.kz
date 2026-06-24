"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import Link from "next/link";
import { CODE_SCANNER_SIMPLE_URL } from "@/lib/code-scanner/url-utils";

interface Props {
  bindUrl: string;
  roleLabel: string;
}

export function BindQr({ bindUrl, roleLabel }: Props) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    void QRCode.toDataURL(bindUrl, { margin: 2, width: 220 }).then(setQrDataUrl);
  }, [bindUrl]);

  const scanHref = `${CODE_SCANNER_SIMPLE_URL}?returnTo=${encodeURIComponent(
    typeof window !== "undefined" ? window.location.pathname + window.location.search : "/tools/family/join",
  )}`;

  async function handleShare() {
    if (navigator.share) {
      try {
        await navigator.share({ title: `Привязка: ${roleLabel}`, url: bindUrl });
        return;
      } catch {
        /* fall through */
      }
    }
    await navigator.clipboard.writeText(bindUrl);
    alert("Ссылка скопирована");
  }

  return (
    <div className="flex flex-col items-center gap-4 p-4">
      <p className="text-sm font-medium text-gray-700">{roleLabel}</p>
      {qrDataUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qrDataUrl} alt="QR привязки" className="rounded-xl border border-gray-200" />
      )}
      <p className="text-xs text-gray-500 text-center max-w-xs">
        Одноразовая ссылка. После сканирования QR станет недействителен.
      </p>
      <button
        type="button"
        onClick={handleShare}
        className="w-full max-w-xs rounded-xl bg-gray-900 text-white py-2.5 text-sm font-semibold"
      >
        Поделиться ссылкой
      </button>
      <Link href={scanHref} className="text-sm text-sky-600 underline">
        Открыть сканер
      </Link>
    </div>
  );
}
