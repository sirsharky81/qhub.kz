"use client";

import type { SmartAction } from "@/lib/file-converter/types";

interface SmartActionsListProps {
  actions: SmartAction[];
  onSelect: (action: SmartAction) => void;
  disabled?: boolean;
}

export function SmartActionsList({ actions, onSelect, disabled }: SmartActionsListProps) {
  if (actions.length === 0) {
    return (
      <p className="text-sm text-gray-500 text-center py-6 bg-gray-50 rounded-xl border border-gray-100">
        Для этого файла нет доступных действий.
      </p>
    );
  }

  const recommended = actions.filter((a) => a.recommended);
  const other = actions.filter((a) => !a.recommended);

  return (
    <section className="space-y-4">
      {recommended.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-widest text-gray-400 mb-2 font-mono">
            Лучший вариант
          </p>
          <div className="space-y-2">
            {recommended.map((action) => (
              <ActionButton
                key={action.id}
                action={action}
                disabled={disabled}
                onSelect={onSelect}
                primary
              />
            ))}
          </div>
        </div>
      )}

      {other.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-widest text-gray-400 mb-2 font-mono">
            Другие действия
          </p>
          <div className="space-y-2">
            {other.map((action) => (
              <ActionButton
                key={action.id}
                action={action}
                disabled={disabled}
                onSelect={onSelect}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function ActionButton({
  action,
  disabled,
  onSelect,
  primary,
}: {
  action: SmartAction;
  disabled?: boolean;
  onSelect: (action: SmartAction) => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect(action)}
      className={`w-full flex items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition-all active:scale-[0.99] touch-manipulation disabled:opacity-50 ${
        primary
          ? "border-gray-900 bg-gray-900 text-white hover:bg-gray-800 shadow-sm"
          : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
      }`}
    >
      <span className="text-lg flex-shrink-0" aria-hidden>
        {action.icon}
      </span>
      <div className="min-w-0 flex-1">
        <span className={`block text-sm font-semibold ${primary ? "text-white" : "text-gray-900"}`}>
          {action.label}
        </span>
        <span className={`block text-xs mt-0.5 ${primary ? "text-gray-300" : "text-gray-500"}`}>
          {action.description}
        </span>
      </div>
      <span className={`flex-shrink-0 text-sm ${primary ? "text-gray-400" : "text-gray-300"}`} aria-hidden>
        →
      </span>
    </button>
  );
}
