"use client";

interface NoteDisplayProps {
  note: string;
  cents: number;
  frequency: number;
  confidence: number;
  displayState: "listening" | "uncertain" | "stable";
}

export default function NoteDisplay({
  note,
  cents,
  frequency,
  confidence,
  displayState,
}: NoteDisplayProps) {
  if (displayState === "listening") {
    return (
      <div className="text-center">
        <p className="text-sm font-medium text-gray-400 dark:text-gray-500">Listening...</p>
        <p className="mt-1 text-xs text-gray-300 dark:text-gray-600">Играйте ноту</p>
      </div>
    );
  }

  const dimmed = displayState === "uncertain";
  const centsLabel = cents > 0 ? `+${cents}` : `${cents}`;
  const color =
    Math.abs(cents) <= 5
      ? "text-emerald-500"
      : Math.abs(cents) <= 15
        ? "text-amber-500"
        : "text-rose-500";

  return (
    <div className={`text-center transition-opacity ${dimmed ? "opacity-60" : "opacity-100"}`}>
      <p className="text-5xl font-bold tracking-tight text-gray-900 dark:text-white">{note}</p>
      <p className={`mt-1 text-2xl font-semibold ${color}`}>{centsLabel} cents</p>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
        {frequency.toFixed(1)} Hz · {confidence}%
      </p>
    </div>
  );
}
