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
    <label className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2 min-w-0">
      <div className="min-w-0 flex-1 pr-1.5">
        <p className="text-xs font-medium leading-snug">{label}</p>
        <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{hint}</p>
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
    <div className="px-3 pb-1.5 space-y-1.5">
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
