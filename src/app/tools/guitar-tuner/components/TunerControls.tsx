"use client";

export type TunerSessionState = "idle" | "active" | "paused";

interface TunerControlsProps {
  sessionState: TunerSessionState;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

export default function TunerControls({
  sessionState,
  onStart,
  onPause,
  onResume,
  onStop,
}: TunerControlsProps) {
  if (sessionState === "idle") {
    return (
      <button
        type="button"
        onClick={onStart}
        className="w-full rounded-xl bg-emerald-600 py-4 text-base font-semibold text-white shadow-sm hover:bg-emerald-700 active:scale-[0.98] transition-transform"
      >
        Начать проверку
      </button>
    );
  }

  return (
    <div className="flex gap-3">
      {sessionState === "active" ? (
        <button
          type="button"
          onClick={onPause}
          className="flex-1 rounded-xl border border-gray-300 bg-white py-4 text-base font-semibold text-gray-800 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
        >
          Пауза
        </button>
      ) : (
        <button
          type="button"
          onClick={onResume}
          className="flex-1 rounded-xl bg-emerald-600 py-4 text-base font-semibold text-white hover:bg-emerald-700"
        >
          Продолжить
        </button>
      )}
      <button
        type="button"
        onClick={onStop}
        className="flex-1 rounded-xl border border-rose-300 bg-rose-50 py-4 text-base font-semibold text-rose-700 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-950/60"
      >
        Завершить
      </button>
    </div>
  );
}
