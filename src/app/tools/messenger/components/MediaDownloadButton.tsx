"use client";

import { useCallback, useState } from "react";
import { saveBase64Media } from "@/lib/messenger/files";

interface Props {
  base64: string;
  mime: string;
  filename: string;
  mine?: boolean;
  className?: string;
}

export function MediaDownloadButton({ base64, mime, filename, mine, className }: Props) {
  const [busy, setBusy] = useState(false);

  const handleDownload = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await saveBase64Media(base64, mime, filename);
    } finally {
      setBusy(false);
    }
  }, [base64, busy, filename, mime]);

  return (
    <button
      type="button"
      onClick={() => void handleDownload()}
      disabled={busy}
      className={
        className ??
        `flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${
          mine
            ? "text-white/90 hover:bg-white/15 disabled:opacity-50"
            : "text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
        }`
      }
      aria-label="Скачать"
      title="Скачать"
    >
      {busy ? (
        <span className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
      ) : (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 3v12" strokeLinecap="round" />
          <path d="M7 10l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M5 21h14" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}
