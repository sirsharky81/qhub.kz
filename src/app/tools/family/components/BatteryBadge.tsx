interface Props {
  level: number | null | undefined;
}

export function BatteryBadge({ level }: Props) {
  if (level == null) return null;
  const color =
    level > 50 ? "text-emerald-600 bg-emerald-50" : level > 20 ? "text-amber-600 bg-amber-50" : "text-red-600 bg-red-50";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap tabular-nums ${color}`}>
      🔋 {level}%
    </span>
  );
}
