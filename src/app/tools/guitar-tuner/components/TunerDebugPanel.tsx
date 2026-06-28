"use client";

import { exportAudioDebugBundle, getTunerEventLog } from "@/lib/audioDebug";

export default function TunerDebugPanel() {
  if (process.env.NODE_ENV === "production") return null;

  const events = getTunerEventLog();

  return (
    <details className="mt-4 rounded-lg border border-dashed border-gray-300 p-3 text-xs dark:border-gray-700">
      <summary className="cursor-pointer font-medium text-gray-500">Debug</summary>
      <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-gray-400">
        {events.slice(0, 10).map((e, i) => (
          <li key={i}>
            {e.time} {e.event} {e.detail ?? ""}
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="mt-2 text-emerald-600"
        onClick={() => navigator.clipboard.writeText(exportAudioDebugBundle())}
      >
        Copy debug bundle
      </button>
    </details>
  );
}
