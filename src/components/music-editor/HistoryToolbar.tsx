"use client";

interface HistoryToolbarProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  compact?: boolean;
}

const btnBase =
  "flex items-center gap-1 rounded-lg text-[11px] font-medium border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap";

export function HistoryToolbar({ canUndo, canRedo, onUndo, onRedo, compact }: HistoryToolbarProps) {
  const btnClass = compact ? `${btnBase} px-2 py-1` : `${btnBase} px-2.5 py-1.5`;

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={onUndo}
        disabled={!canUndo}
        title="Отменить (Ctrl+Z)"
        className={btnClass}
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4" />
        </svg>
        Отменить
      </button>
      <button
        type="button"
        onClick={onRedo}
        disabled={!canRedo}
        title="Вернуть (Ctrl+Y)"
        className={btnClass}
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 10H11a5 5 0 00-5 5v2M21 10l-4-4M21 10l-4 4" />
        </svg>
        Вернуть
      </button>
    </div>
  );
}
