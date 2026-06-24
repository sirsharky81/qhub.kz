"use client";

interface Props {
  enabled: boolean;
  loading?: boolean;
  onChange: (enabled: boolean) => void;
}

export function ChildShareLocationToggle({ enabled, loading, onChange }: Props) {
  return (
    <label className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2 w-full min-w-0">
      <div className="min-w-0 flex-1 pr-1.5">
        <p className="text-xs font-medium leading-snug">Делиться геопозицией с родителями</p>
        <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">Родители увидят вас на карте</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        disabled={loading}
        onClick={() => onChange(!enabled)}
        className={`relative inline-flex h-6 w-10 shrink-0 rounded-full transition-colors ${
          enabled ? "bg-emerald-500" : "bg-gray-200"
        } disabled:opacity-50`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform mt-1 ${
            enabled ? "translate-x-5" : "translate-x-1"
          }`}
        />
      </button>
    </label>
  );
}
