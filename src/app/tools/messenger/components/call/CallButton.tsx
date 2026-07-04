"use client";

interface Props {
  disabled?: boolean;
  disabledReason?: string;
  inCall?: boolean;
  onCall: () => void;
  mode?: "audio" | "video";
}

export function CallButton({ disabled, disabledReason, inCall, onCall, mode = "audio" }: Props) {
  const isVideo = mode === "video";
  return (
    <button
      type="button"
      onClick={onCall}
      disabled={disabled || inCall}
      title={
        disabled
          ? disabledReason
          : inCall
            ? "Идёт звонок"
            : isVideo
              ? "Видеозвонок"
              : "Позвонить"
      }
      className={`flex h-9 w-9 items-center justify-center rounded-full shrink-0 ${
        disabled || inCall
          ? "text-gray-300 cursor-not-allowed"
          : isVideo
            ? "text-sky-600 hover:bg-sky-50"
            : "text-emerald-600 hover:bg-emerald-50"
      }`}
      aria-label={isVideo ? "Видеозвонок" : "Позвонить"}
    >
      {isVideo ? (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
          <path d="M4 7a2 2 0 012-2h8a2 2 0 012 2v1.2l3.1-1.9c.66-.4 1.5.07 1.5.84v9.7c0 .77-.84 1.24-1.5.84L16 14.8V16a2 2 0 01-2 2H6a2 2 0 01-2-2V7z" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
          <path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24 11.36 11.36 0 003.56.57 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1 11.36 11.36 0 00.57 3.56 1 1 0 01-.25 1.01l-2.2 2.22z" />
        </svg>
      )}
    </button>
  );
}
