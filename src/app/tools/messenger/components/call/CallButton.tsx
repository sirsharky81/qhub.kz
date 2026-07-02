"use client";

interface Props {
  disabled?: boolean;
  disabledReason?: string;
  inCall?: boolean;
  onCall: () => void;
}

export function CallButton({ disabled, disabledReason, inCall, onCall }: Props) {
  return (
    <button
      type="button"
      onClick={onCall}
      disabled={disabled || inCall}
      title={disabled ? disabledReason : inCall ? "Идёт звонок" : "Позвонить"}
      className={`flex h-9 w-9 items-center justify-center rounded-full shrink-0 ${
        disabled || inCall
          ? "text-gray-300 cursor-not-allowed"
          : "text-emerald-600 hover:bg-emerald-50"
      }`}
      aria-label="Позвонить"
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
        <path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24 11.36 11.36 0 003.56.57 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1 11.36 11.36 0 00.57 3.56 1 1 0 01-.25 1.01l-2.2 2.22z" />
      </svg>
    </button>
  );
}
