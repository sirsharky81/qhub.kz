"use client";

export interface LiveMetricCard {
  id: string;
  label: string;
  value: string;
  unit: string;
  minText?: string | null;
  maxText?: string | null;
  highlight?: boolean;
  onToggleSelect?: () => void;
  selected?: boolean;
}

export function LiveMetricCards({
  items,
  selectable,
}: {
  items: LiveMetricCard[];
  selectable?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <ul className="grid grid-cols-2 gap-2 text-sm">
      {items.map((p) => (
        <li
          key={p.id}
          onClick={selectable && p.onToggleSelect ? p.onToggleSelect : undefined}
          className={`min-h-[4.25rem] rounded-lg border px-2.5 py-2 ${
            selectable ? "cursor-pointer" : ""
          } ${
            p.highlight || p.selected
              ? "border-emerald-500/50 bg-emerald-50"
              : "border-gray-200 bg-white shadow-sm"
          }`}
        >
          <div className="truncate text-[10px] leading-tight text-gray-500">{p.label}</div>
          <div className="mt-0.5 text-base font-semibold tabular-nums text-gray-900">
            {p.value}{" "}
            <span className="text-xs font-normal text-gray-500">{p.unit}</span>
          </div>
          {p.minText != null && p.maxText != null && p.minText !== p.maxText ? (
            <div className="mt-0.5 font-mono text-[10px] tabular-nums text-gray-500">
              мин {p.minText} · макс {p.maxText}
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
