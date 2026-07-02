"use client";

interface Props {
  peerTitle: string;
  onAccept: () => void;
  onDecline: () => void;
}

export function IncomingCallOverlay({ peerTitle, onAccept, onDecline }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gray-900/95 text-white px-6">
      <div
        className="flex flex-col items-center gap-6 w-full max-w-sm"
        style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="h-24 w-24 rounded-full bg-emerald-500/20 flex items-center justify-center text-4xl">
          📞
        </div>
        <div className="text-center">
          <p className="text-sm text-gray-300">Входящий звонок</p>
          <h2 className="text-2xl font-semibold mt-1">{peerTitle}</h2>
        </div>
        <div className="flex items-center gap-8 mt-8">
          <button
            type="button"
            onClick={onDecline}
            className="h-16 w-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-2xl"
            aria-label="Отклонить"
          >
            ✕
          </button>
          <button
            type="button"
            onClick={onAccept}
            className="h-16 w-16 rounded-full bg-emerald-500 hover:bg-emerald-600 flex items-center justify-center text-2xl"
            aria-label="Принять"
          >
            ✓
          </button>
        </div>
      </div>
    </div>
  );
}
