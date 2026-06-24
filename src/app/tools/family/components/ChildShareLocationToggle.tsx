"use client";

interface Props {
  enabled: boolean;
  loading?: boolean;
  onChange: (enabled: boolean) => void;
}

export function ChildShareLocationToggle({ enabled, loading, onChange }: Props) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 px-4 py-3 w-full min-w-0">
      <div className="min-w-0 flex-1 pr-2">
        <p className="text-sm font-medium leading-snug">Делиться геопозицией с родителями</p>
        <p className="text-xs text-gray-500 mt-0.5 leading-snug">Родители увидят вас на карте</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        disabled={loading}
        onClick={() => onChange(!enabled)}
        className={`relative inline-flex h-7 w-12 shrink-0 rounded-full transition-colors ${
          enabled ? "bg-emerald-500" : "bg-gray-200"
        } disabled:opacity-50`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform mt-1 ${
            enabled ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </label>
  );
}
