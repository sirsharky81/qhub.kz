"use client";

interface ToggleProps {
  label: string;
  hint: string;
  enabled: boolean;
  loading?: boolean;
  onChange: (enabled: boolean) => void;
}

function LocationToggle({ label, hint, enabled, loading, onChange }: ToggleProps) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 px-4 py-3 min-w-0">
      <div className="min-w-0 flex-1 pr-2">
        <p className="text-sm font-medium leading-snug">{label}</p>
        <p className="text-xs text-gray-500 mt-0.5 leading-snug">{hint}</p>
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

interface Props {
  shareWithChildren: boolean;
  shareWithParents: boolean;
  hasOtherParent: boolean;
  loading?: boolean;
  onShareWithChildren: (enabled: boolean) => void;
  onShareWithParents: (enabled: boolean) => void;
}

export function ShareLocationPanel({
  shareWithChildren,
  shareWithParents,
  hasOtherParent,
  loading,
  onShareWithChildren,
  onShareWithParents,
}: Props) {
  return (
    <div className="px-4 pb-2 space-y-2">
      <LocationToggle
        label="Для участников"
        hint="Участники увидят вас на карте"
        enabled={shareWithChildren}
        loading={loading}
        onChange={onShareWithChildren}
      />
      <LocationToggle
        label="Для родителей"
        hint={
          hasOtherParent
            ? "Только для других родителей семьи"
            : "Доступно после приглашения второго родителя"
        }
        enabled={shareWithParents}
        loading={loading || !hasOtherParent}
        onChange={onShareWithParents}
      />
    </div>
  );
}
