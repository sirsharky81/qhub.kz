"use client";

import { useEffect } from "react";

interface MusicToastProps {
  message: string | null;
  onDismiss: () => void;
}

export function MusicToast({ message, onDismiss }: MusicToastProps) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onDismiss, 3500);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);

  if (!message) return null;

  return (
    <div
      role="status"
      className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[200] max-w-[min(90vw,360px)] px-4 py-2.5 rounded-xl bg-gray-900/95 text-white text-xs leading-snug shadow-lg pointer-events-none"
      style={{ paddingBottom: "max(0.625rem, env(safe-area-inset-bottom))" }}
    >
      {message}
    </div>
  );
}
