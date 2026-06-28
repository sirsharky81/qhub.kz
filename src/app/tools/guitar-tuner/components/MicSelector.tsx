"use client";

interface MicSelectorProps {
  mics: MediaDeviceInfo[];
  value: string | null;
  onChange: (deviceId: string) => void;
  level: number;
}

export default function MicSelector({ mics, value, onChange, level }: MicSelectorProps) {
  if (mics.length === 0) return null;

  return (
    <div className="flex items-center gap-3 rounded-xl bg-gray-50 px-4 py-2 dark:bg-gray-900">
      <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all duration-75"
          style={{ width: `${Math.min(level * 400, 100)}%` }}
        />
      </div>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="max-w-[10rem] truncate rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-800"
      >
        {mics.map((mic) => (
          <option key={mic.deviceId} value={mic.deviceId}>
            {mic.label || `Mic ${mic.deviceId.slice(0, 6)}`}
          </option>
        ))}
      </select>
    </div>
  );
}
